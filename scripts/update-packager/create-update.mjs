import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [keyPath, installerPath, outputPath, version, summary, minimumDatabaseVersion = "10"] = process.argv.slice(2);
if (!keyPath || !installerPath || !outputPath || !version || !summary) throw new Error("Uso: node create-update.mjs <chave.pem> <instalador.exe|msi> <saida.cncupd> <versao> <resumo> [migracao-minima]");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Use versão semântica MAJOR.MINOR.PATCH.");
if (!outputPath.toLowerCase().endsWith(".cncupd")) throw new Error("A saída deve usar .cncupd.");
if (!/\.(exe|msi)$/i.test(installerPath)) throw new Error("Use um instalador Windows EXE ou MSI.");
if (statSync(installerPath).size > 1_073_741_824) throw new Error("O instalador excede 1 GiB.");
const installer = readFileSync(installerPath);
const { createHash } = await import("node:crypto");
const manifest = { version, publishedAt: new Date().toISOString(), summary: summary.trim(), installerFileName: basename(installerPath), installerSha256: createHash("sha256").update(installer).digest("hex"), minimumDatabaseVersion: Number(minimumDatabaseVersion) };
const signature = sign(null, Buffer.from(JSON.stringify(manifest)), createPrivateKey(readFileSync(keyPath))).toString("base64");
writeFileSync(outputPath, JSON.stringify({ manifest, installerBase64: installer.toString("base64"), signature }), { encoding: "utf8", mode: 0o600 });
