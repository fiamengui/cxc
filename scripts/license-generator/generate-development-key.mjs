import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const output = process.argv[2];
if (!output) throw new Error("Informe o caminho do arquivo privado de desenvolvimento.");
const privatePath = resolve(output);
if (existsSync(privatePath)) throw new Error("A chave de desenvolvimento já existe; não será substituída.");
mkdirSync(dirname(privatePath), { recursive: true });
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicDer = publicKey.export({ type: "spki", format: "der" });
const publicRaw = publicDer.subarray(publicDer.length - 32).toString("base64");
writeFileSync(privatePath, privatePem, { encoding: "utf8", mode: 0o600 });
process.stdout.write(publicRaw);
