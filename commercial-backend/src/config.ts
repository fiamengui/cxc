import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.ipv4().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL_MODE: z.enum(["disable", "verify-full"]).default("verify-full"),
  COMMERCIAL_PUBLIC_URL: z.string().url().startsWith("https://"),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(20),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(16),
  MERCADO_PAGO_MONTHLY_PLAN_ID: z.string().min(4),
  MERCADO_PAGO_ANNUAL_PLAN_ID: z.string().min(4),
  ENTITLEMENT_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  ENTITLEMENT_PRIVATE_KEY_BASE64: z.string().min(40).optional(),
  ENTITLEMENT_KEY_ID: z.string().regex(/^[a-zA-Z0-9._-]{3,64}$/),
  ALLOWED_APP_ORIGIN: z.string().url().startsWith("https://"),
  COMMERCIAL_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
}).superRefine((value, context) => {
  if (!value.ENTITLEMENT_PRIVATE_KEY_PATH && !value.ENTITLEMENT_PRIVATE_KEY_BASE64) context.addIssue({ code:"custom", path:["ENTITLEMENT_PRIVATE_KEY_PATH"], message:"Informe a chave privada por arquivo ou secret base64." });
  if (value.COMMERCIAL_ENVIRONMENT !== "production") return;
  if (!value.MERCADO_PAGO_ACCESS_TOKEN.startsWith("APP_USR-")) context.addIssue({ code:"custom", path:["MERCADO_PAGO_ACCESS_TOKEN"], message:"Produção exige credencial Mercado Pago de produção." });
  for (const key of ["MERCADO_PAGO_MONTHLY_PLAN_ID","MERCADO_PAGO_ANNUAL_PLAN_ID"] as const) {
    if (/replace|sandbox|test/i.test(value[key])) context.addIssue({ code:"custom", path:[key], message:"Produção não aceita identificador fictício ou sandbox." });
  }
  if (/example\.com|\.invalid|localhost|127\.0\.0\.1/i.test(value.COMMERCIAL_PUBLIC_URL)) context.addIssue({ code:"custom", path:["COMMERCIAL_PUBLIC_URL"], message:"Produção exige URL pública HTTPS real." });
});

export type Config = z.infer<typeof schema>;
export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): Config => schema.parse(environment);
