import { createPrivateKey, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";

const [keyPath, licensePath, expectedPublicKey] = process.argv.slice(2);
if (!keyPath || !licensePath || !expectedPublicKey) throw new Error("Informe chave privada, licença e chave pública esperada.");
const privateKey = createPrivateKey(readFileSync(keyPath));
const publicDer = createPublicKey(privateKey).export({ type: "spki", format: "der" });
const actualPublicKey = publicDer.subarray(publicDer.length - 32).toString("base64");
if (actualPublicKey !== expectedPublicKey) throw new Error("A chave pública incorporada não corresponde à chave privada externa.");
const signed = JSON.parse(readFileSync(licensePath, "utf8"));
const valid = verify(null, Buffer.from(JSON.stringify(signed.payload)), createPublicKey(privateKey), Buffer.from(signed.signature, "base64"));
if (!valid) throw new Error("A assinatura da licença gerada é inválida.");
process.stdout.write(JSON.stringify({ publicKeyMatches: true, signatureValid: true, edition: signed.payload.edition, major: signed.payload.authorizedMajorVersion }));
