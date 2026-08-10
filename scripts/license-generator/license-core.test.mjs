import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { issueLicense, listLicenses, updateLicenseStatus } from "./license-core.mjs";

test("emite IDs sequenciais, assina, reemite e registra status", () => {
  const directory = mkdtempSync(join(tmpdir(), "cnc-license-"));
  const keyPath = join(directory, "private.pem");
  const registryPath = join(directory, "registry.json");
  const outputDirectory = join(directory, "licenses");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  const common = { keyPath, registryPath, outputDirectory, customerName: "Cliente", installationId: "CNC-ABCD-1234-EF56" };
  const first = issueLicense(common);
  const second = issueLicense({ ...common, reissueOf: first.licenseId });
  assert.equal(first.licenseId, "CNC-00000001");
  assert.equal(second.licenseId, "CNC-00000002");
  const document = JSON.parse(readFileSync(second.outputPath, "utf8"));
  assert.equal(document.payload.product, "CAIXA_NO_CONTROLE");
  assert.ok(verify(null, Buffer.from(JSON.stringify(document.payload)), publicKey, Buffer.from(document.signature, "base64")));
  const records = listLicenses(registryPath);
  assert.equal(records[0].status, "REISSUED");
  assert.equal(records[1].reissueOf, first.licenseId);
  assert.equal(updateLicenseStatus(registryPath, second.licenseId, "REVOKED_ADMINISTRATIVELY").status, "REVOKED_ADMINISTRATIVELY");
});
