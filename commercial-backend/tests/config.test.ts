import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

const valid = {
  NODE_ENV:"production",
  HOST:"0.0.0.0",
  PORT:"8080",
  DATABASE_URL:"postgresql://user:secret@db.example.net:5432/commercial",
  DATABASE_DIRECT_URL:"postgresql://owner:secret@db.example.net:5432/commercial",
  DATABASE_SSL_MODE:"verify-full",
  COMMERCIAL_PUBLIC_URL:"https://commercial.bratecinfo.com.br",
  ALLOWED_APP_ORIGIN:"https://app.bratecinfo.com.br",
  COMMERCIAL_ENVIRONMENT:"production",
  MERCADO_PAGO_ACCESS_TOKEN:"APP_USR-production-token-placeholder",
  MERCADO_PAGO_WEBHOOK_SECRET:"production-webhook-secret-placeholder",
  MERCADO_PAGO_MONTHLY_PLAN_ID:"monthly-production-id",
  MERCADO_PAGO_ANNUAL_PLAN_ID:"annual-production-id",
  ENTITLEMENT_PRIVATE_KEY_PATH:"/run/secrets/entitlement.pem",
  ENTITLEMENT_KEY_ID:"cnc-commercial-2026-01",
  APP_RELEASE:"1.2.0-beta.1",
  RELEASE_CHANNEL:"beta",
  BETA_MODE:"true",
  BETA_MAX_CUSTOMERS:"5",
  BETA_ADMIN_TOKEN:"beta-admin-token-placeholder-32-characters",
  BETA_INVITE_PEPPER:"beta-invite-pepper-placeholder-32-characters",
} satisfies NodeJS.ProcessEnv;

test("aceita somente configuração de produção coerente", () => {
  assert.equal(loadConfig(valid).HOST, "0.0.0.0");
  assert.equal(loadConfig(valid).BETA_MAX_CUSTOMERS, 5);
  assert.equal(loadConfig({...valid,ENTITLEMENT_PRIVATE_KEY_PATH:undefined,ENTITLEMENT_PRIVATE_KEY_BASE64:Buffer.from("private-key-placeholder-with-enough-length").toString("base64")}).ENTITLEMENT_PRIVATE_KEY_PATH, undefined);
});

test("rejeita URL fictícia e credencial sandbox em produção", () => {
  assert.throws(() => loadConfig({...valid,COMMERCIAL_PUBLIC_URL:"https://commercial.invalid",MERCADO_PAGO_ACCESS_TOKEN:"TEST-sandbox-token-placeholder"}));
});

test("rejeita produção sem conexão direta de migrations", () => {
  assert.throws(() => loadConfig({...valid,DATABASE_DIRECT_URL:undefined}));
});

test("rejeita IDs iguais para planos comerciais diferentes", () => {
  assert.throws(() => loadConfig({...valid,MERCADO_PAGO_ANNUAL_PLAN_ID:valid.MERCADO_PAGO_MONTHLY_PLAN_ID}));
});

test("beta ativa exige dois secrets administrativos", () => {
  assert.throws(() => loadConfig({...valid,BETA_ADMIN_TOKEN:undefined}));
  assert.throws(() => loadConfig({...valid,BETA_INVITE_PEPPER:undefined}));
});
