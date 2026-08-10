import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { EntitlementSigner } from "./entitlement.js";
import { MercadoPagoProvider } from "./mercado-pago-provider.js";
import { PostgresCommercialRepository } from "./repository.js";
import { CommercialService } from "./service.js";

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000, ssl: config.DATABASE_SSL_MODE === "verify-full" ? { rejectUnauthorized: true } : undefined });
const service = new CommercialService(new PostgresCommercialRepository(pool), new MercadoPagoProvider(config), new EntitlementSigner(config), config.ENTITLEMENT_KEY_ID, undefined, {enabled:config.BETA_MODE,maxCustomers:config.BETA_MAX_CUSTOMERS,invitePepper:config.BETA_INVITE_PEPPER??""});
const app = Fastify({ logger: { level: config.NODE_ENV === "production" ? "info" : "debug", redact: ["req.headers.authorization", "req.headers.x-signature", "body.signature", "body.document", "body.email", "body.code"] }, bodyLimit: 64 * 1024, requestTimeout: 20_000 });

const checkoutSchema = z.object({ name:z.string().trim().min(2).max(120), email:z.string().email().max(254), document:z.string().trim().max(32).nullable().default(null), installationCode:z.string().regex(/^CNC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/), devicePublicKey:z.string().base64().max(128), deviceFingerprint:z.string().regex(/^[a-f0-9]{64}$/), planCode:z.enum(["ESSENTIAL_MONTHLY","ESSENTIAL_ANNUAL"]) }).strict();
const challengeSchema = z.object({ installationCode:z.string().min(8).max(64), action:z.literal("entitlement.refresh"), requestId:z.string().min(8).max(128) }).strict();
const refreshSchema = z.object({ installationCode:z.string().min(8).max(64), subscriptionId:z.string().uuid(), challengeId:z.string().uuid(), nonce:z.string().min(32).max(128), requestId:z.string().min(8).max(128), timestamp:z.string().datetime(), action:z.literal("entitlement.refresh"), signature:z.string().base64().max(256) }).strict();
const betaActivationSchema=z.object({code:z.string().trim().toUpperCase().regex(/^BETA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/),name:z.string().trim().min(2).max(120),email:z.string().email().max(254),installationCode:z.string().regex(/^CNC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/),devicePublicKey:z.string().base64().max(128),deviceFingerprint:z.string().regex(/^[a-f0-9]{64}$/),clientVersion:z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)}).strict();
const betaInvitationSchema=z.object({email:z.string().email().max(254),notes:z.string().trim().max(1000).nullable().default(null)}).strict();
const betaStatusSchema=z.object({status:z.enum(["INVITED","ACTIVE","SUSPENDED","CONVERTED","CLOSED"]),notes:z.string().trim().max(1000).nullable().default(null)}).strict();

function assertBetaAdmin(authorization:unknown){
  if(!config.BETA_MODE||!config.BETA_ADMIN_TOKEN)throw new Error("Administração beta não está disponível.");
  const supplied=String(authorization??"").replace(/^Bearer\s+/i,"");const expected=config.BETA_ADMIN_TOKEN;
  const left=Buffer.from(supplied);const right=Buffer.from(expected);
  if(left.length!==right.length||!timingSafeEqual(left,right))throw new Error("Autorização administrativa inválida.");
}

const buckets = new Map<string,{count:number;resetAt:number}>();
app.addHook("onRequest", async (request, reply) => {
  const origin=request.headers.origin;
  if(origin&&origin!==config.ALLOWED_APP_ORIGIN)return reply.code(403).send({error:"Origem não autorizada."});
  const now=Date.now(); const key=`${request.ip}:${request.routeOptions.url}`; const bucket=buckets.get(key);
  const limit=request.routeOptions.url==="/v1/checkout"||request.routeOptions.url==="/v1/beta/activate"?10:request.routeOptions.url==="/v1/installations/challenge"||request.routeOptions.url==="/v1/entitlements/refresh"?30:request.routeOptions.url==="/v1/webhooks/mercado-pago"?300:60;
  if (!bucket || bucket.resetAt <= now) buckets.set(key,{count:1,resetAt:now+60_000});
  else if (++bucket.count > limit) return reply.code(429).send({ error:"Muitas solicitações. Aguarde um minuto." });
});
app.addHook("onSend", async (request, reply, payload) => {
  if(request.headers.origin===config.ALLOWED_APP_ORIGIN)reply.header("access-control-allow-origin",config.ALLOWED_APP_ORIGIN).header("vary","Origin");
  reply.header("x-content-type-options","nosniff").header("referrer-policy","no-referrer").header("cache-control","no-store").header("content-security-policy","default-src 'none'");
  return payload;
});
app.setErrorHandler((error, request, reply) => {
  const failure = error instanceof Error ? error : new Error("Falha desconhecida.");
  request.log.warn({ err: { name:failure.name, message:failure.message }, requestId:request.id }, "commercial_request_failed");
  const validation = error instanceof z.ZodError;
  const rejected = failure.message.includes("inválid") || failure.message.includes("não") || failure.message.includes("diverge") || failure.message.includes("expirado");
  const capacity=failure.message.includes("vagas da beta");
  reply.code(validation ? 400 : capacity ? 409 : rejected ? 401 : 503).send({ error: validation ? "Dados enviados são inválidos." : capacity||rejected ? failure.message : "Serviço comercial temporariamente indisponível.", requestId:request.id });
});

app.get("/health", async () => ({ status:"ok", version:config.APP_RELEASE, timestamp:new Date().toISOString(), environment:config.NODE_ENV, releaseChannel:config.RELEASE_CHANNEL }));
app.get("/health/database", async (_request, reply) => {
  try {
    await pool.query("SELECT 1");
    return { status:"ok", timestamp:new Date().toISOString() };
  } catch {
    return reply.code(503).send({ status:"unavailable", timestamp:new Date().toISOString() });
  }
});
app.get("/checkout/return", async (_request, reply) => reply.type("text/html; charset=utf-8").send("<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Pagamento recebido</title><body><main><h1>Pagamento recebido</h1><p>Volte ao CaixaSimples - Bratec e clique em Verificar pagamento. A liberação depende da confirmação segura do Mercado Pago.</p></main></body></html>"));
app.get("/v1/plans", async () => ({ plans:service.listPlans() }));
app.post("/v1/checkout", async request => service.createCheckout(checkoutSchema.parse(request.body)));
app.post("/v1/beta/activate",async request=>service.activateBeta(betaActivationSchema.parse(request.body)));
app.get("/v1/admin/beta",async request=>{assertBetaAdmin(request.headers.authorization);return service.betaOverview();});
app.post("/v1/admin/beta/invitations",async request=>{assertBetaAdmin(request.headers.authorization);return service.createBetaInvitation(betaInvitationSchema.parse(request.body));});
app.patch("/v1/admin/beta/:id",async request=>{assertBetaAdmin(request.headers.authorization);const params=z.object({id:z.string().uuid()}).parse(request.params);const body=betaStatusSchema.parse(request.body);return service.updateBetaStatus(params.id,body.status,body.notes);});
app.post("/v1/installations/challenge", async request => { const body=challengeSchema.parse(request.body); return service.createChallenge(body.installationCode,body.action,body.requestId); });
app.post("/v1/entitlements/refresh", async request => service.refreshEntitlement(refreshSchema.parse(request.body)));
app.post("/v1/webhooks/mercado-pago", async (request, reply) => {
  const query=z.object({ data_id:z.string().optional(), "data.id":z.string().optional() }).passthrough().parse(request.query);
  const body=z.object({ data:z.object({id:z.union([z.string(),z.number()])}).optional() }).passthrough().parse(request.body);
  const dataId=query.data_id ?? query["data.id"] ?? (body.data?.id === undefined ? undefined : String(body.data.id));
  if (!dataId) return reply.code(400).send({error:"Identificador do evento ausente."});
  await service.processWebhook({ xSignature:String(request.headers["x-signature"] ?? ""), xRequestId:String(request.headers["x-request-id"] ?? ""), dataId, body:request.body });
  return reply.code(200).send({ received:true });
});

const close=async()=>{ await app.close(); await pool.end(); };
process.on("SIGTERM",close); process.on("SIGINT",close);
await app.listen({ host:config.HOST, port:config.PORT });
