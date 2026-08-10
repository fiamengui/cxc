import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Config } from "./config.js";
import type { EntitlementPayload } from "./domain.js";

export type SignedEntitlement = { payload: EntitlementPayload; signature: string; algorithm: "Ed25519" };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export class EntitlementSigner {
  private readonly key;
  constructor(config: Pick<Config, "ENTITLEMENT_PRIVATE_KEY_PATH" | "ENTITLEMENT_PRIVATE_KEY_BASE64" | "ENTITLEMENT_KEY_ID">) {
    const source = config.ENTITLEMENT_PRIVATE_KEY_BASE64
      ? Buffer.from(config.ENTITLEMENT_PRIVATE_KEY_BASE64, "base64")
      : readFileSync(config.ENTITLEMENT_PRIVATE_KEY_PATH!);
    this.key = createPrivateKey(source);
    if (this.key.asymmetricKeyType !== "ed25519") throw new Error("A chave de entitlement deve ser Ed25519.");
  }
  sign(payload: EntitlementPayload): SignedEntitlement {
    const serialized = canonical(payload);
    return { payload, signature: sign(null, Buffer.from(serialized), this.key).toString("base64"), algorithm: "Ed25519" };
  }
  hash(document: SignedEntitlement): string { return createHash("sha256").update(canonical(document)).digest("hex"); }
}

export const canonicalDeviceChallenge = (input: { challengeId: string; installationCode: string; nonce: string; requestId: string; timestamp: string; action: string }): string =>
  ["cnc-device-challenge-v1", input.challengeId, input.installationCode, input.nonce, input.requestId, input.timestamp, input.action].join("|");
