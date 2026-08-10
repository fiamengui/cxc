import { createHash, createPrivateKey, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const PRODUCT = "CAIXA_NO_CONTROLE";
export const SCHEMA_VERSION = 1;
export const ESSENTIAL_FEATURES = ["financial_core", "contacts", "catalog", "sales", "reports", "backup", "goals"];
export const ALLOWED_FEATURES = [...ESSENTIAL_FEATURES, "professional_features", "inventory", "multi_user"];
export const STATUSES = ["ACTIVE", "REISSUED", "REVOKED_ADMINISTRATIVELY"];

function loadRegistry(path) {
  if (!existsSync(path)) return { schemaVersion: 1, licenses: [] };
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value.schemaVersion !== 1 || !Array.isArray(value.licenses)) throw new Error("Registro administrativo inválido.");
  return value;
}

function saveJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

function nextLicenseId(registry) {
  const maximum = registry.licenses.reduce((current, item) => {
    const match = /^CNC-(\d{8})$/.exec(item.licenseId ?? "");
    return Math.max(current, match ? Number(match[1]) : 0);
  }, 0);
  return `CNC-${String(maximum + 1).padStart(8, "0")}`;
}

function required(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`Informe ${label}.`);
  return normalized;
}

export function issueLicense(options) {
  const keyPath = resolve(required(options.keyPath, "a chave privada"));
  const registryPath = resolve(required(options.registryPath, "o registro administrativo"));
  const outputDirectory = resolve(required(options.outputDirectory, "a pasta de saída"));
  const customerName = required(options.customerName, "o nome do cliente");
  const installationId = required(options.installationId, "o código da instalação").toUpperCase();
  if (!/^CNC-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(installationId)) throw new Error("Código da instalação inválido.");
  const edition = options.edition ?? "ESSENTIAL";
  if (!['ESSENTIAL', 'PROFESSIONAL', 'BUSINESS'].includes(edition)) throw new Error("Edição inválida.");
  const major = Number(options.authorizedMajorVersion ?? 1);
  if (!Number.isInteger(major) || major < 1) throw new Error("Versão principal inválida.");
  const registry = loadRegistry(registryPath);
  const prior = options.reissueOf
    ? registry.licenses.find((item) => item.licenseId === options.reissueOf)
    : null;
  if (options.reissueOf && !prior) throw new Error("Licença original da reemissão não encontrada.");
  const licenseId = nextLicenseId(registry);
  const requestedFeatures = Array.isArray(options.features)
    ? options.features
    : String(options.features ?? "").split(",");
  const features = requestedFeatures.map((value) => String(value).trim()).filter(Boolean);
  if (!features.length) features.push(...ESSENTIAL_FEATURES);
  if (!features.includes("financial_core") || features.some((feature) => !ALLOWED_FEATURES.includes(feature))) throw new Error("Recursos da licença inválidos.");
  const payload = {
    licenseId,
    customerName,
    ...(options.customerDocumentOptional ? { customerDocumentOptional: String(options.customerDocumentOptional).trim() } : {}),
    ...(options.customerEmailOptional ? { customerEmailOptional: String(options.customerEmailOptional).trim() } : {}),
    product: PRODUCT,
    edition,
    authorizedMajorVersion: major,
    installationId,
    issuedAt: new Date().toISOString(),
    deviceLimit: 1,
    features,
    licenseSchemaVersion: SCHEMA_VERSION,
    ...(options.notes ? { notes: String(options.notes).trim() } : {}),
  };
  const privateKey = createPrivateKey(readFileSync(keyPath));
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("A chave informada não é Ed25519.");
  const signature = sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString("base64");
  const document = JSON.stringify({ payload, signature }, null, 2);
  const fileHashSha256 = createHash("sha256").update(document).digest("hex");
  mkdirSync(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, `${licenseId}.cnclic`);
  writeFileSync(outputPath, document, { encoding: "utf8", mode: 0o600 });

  if (options.reissueOf) {
    prior.status = "REISSUED";
    prior.updatedAt = new Date().toISOString();
  }
  registry.licenses.push({
    licenseId,
    customerName,
    customerDocumentOptional: options.customerDocumentOptional || null,
    customerEmailOptional: options.customerEmailOptional || null,
    installationId,
    edition,
    authorizedMajorVersion: major,
    issuedAt: payload.issuedAt,
    status: "ACTIVE",
    reissueOf: options.reissueOf || null,
    notes: options.notes || null,
    fileHashSha256,
    outputPath,
    updatedAt: payload.issuedAt,
  });
  saveJsonAtomic(registryPath, registry);
  return { licenseId, outputPath, fileHashSha256, payload };
}

export function listLicenses(registryPath) {
  return loadRegistry(resolve(registryPath)).licenses;
}

export function updateLicenseStatus(registryPath, licenseId, status) {
  if (!STATUSES.includes(status)) throw new Error("Status administrativo inválido.");
  const path = resolve(registryPath);
  const registry = loadRegistry(path);
  const item = registry.licenses.find((license) => license.licenseId === licenseId);
  if (!item) throw new Error("Licença não encontrada.");
  item.status = status;
  item.updatedAt = new Date().toISOString();
  saveJsonAtomic(path, registry);
  return item;
}
