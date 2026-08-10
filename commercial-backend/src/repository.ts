import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Plan, ProviderSubscriptionSnapshot, SubscriptionRecord, SubscriptionState } from "./domain.js";

export type CheckoutContextInput = { name: string; email: string; document: string | null; installationCode: string; devicePublicKey: string; deviceFingerprint: string; plan: Plan };
export type CheckoutContext = { subscription: SubscriptionRecord; customerEmail: string; installationCode: string };
export type Challenge = { id: string; installationId: string; expiresAt: Date };

export interface CommercialRepository {
  createCheckoutContext(input: CheckoutContextInput): Promise<CheckoutContext>;
  bindProviderSubscription(subscriptionId: string, providerSubscriptionId: string): Promise<void>;
  getSubscription(id: string): Promise<SubscriptionRecord | null>;
  findInstallationByCode(code: string): Promise<{ id: string; publicKey: string; fingerprint: string; status: string } | null>;
  createChallenge(installationId: string, nonceHash: string, expiresAt: Date): Promise<Challenge>;
  consumeChallenge(challengeId: string, installationId: string, nonceHash: string): Promise<boolean>;
  applyProviderSnapshot(snapshot: ProviderSubscriptionSnapshot): Promise<{ duplicate: boolean; subscription: SubscriptionRecord | null }>;
  nextEntitlementSequence(subscriptionId: string): Promise<number>;
  recordEntitlement(input: { id: string; subscriptionId: string; installationId: string; edition: string; validFrom: Date; validUntil: Date; serverSequence: number; signedPayloadHash: string; keyId: string }): Promise<void>;
}

export class PostgresCommercialRepository implements CommercialRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async createCheckoutContext(input: CheckoutContextInput): Promise<CheckoutContext> {
    return this.transaction(async (client) => {
      const customer = await client.query<{ id: string }>("INSERT INTO customers(id,name,email,document,created_at) VALUES($1,$2,lower($3),$4,now()) ON CONFLICT(email) DO UPDATE SET name=excluded.name,document=COALESCE(excluded.document,customers.document) RETURNING id", [randomUUID(), input.name, input.email, input.document]);
      const customerId = customer.rows[0]!.id;
      const installation = await client.query<{ id: string }>("INSERT INTO installations(id,customer_id,installation_code,device_public_key,fingerprint,first_seen_at,last_seen_at,status) VALUES($1,$2,$3,$4,$5,now(),now(),'ACTIVE') ON CONFLICT(installation_code) DO UPDATE SET last_seen_at=now() WHERE installations.customer_id=$2 AND installations.device_public_key=$4 AND installations.fingerprint=$5 AND installations.status='ACTIVE' RETURNING id", [randomUUID(), customerId, input.installationCode, input.devicePublicKey, input.deviceFingerprint]);
      const installationId = installation.rows[0]?.id;
      if (!installationId) throw new Error("Código de instalação já vinculado a outra identidade ou cliente.");
      const id = randomUUID();
      await client.query("INSERT INTO subscriptions(id,customer_id,installation_id,plan_code,provider,status,created_at,updated_at) VALUES($1,$2,$3,$4,'MERCADO_PAGO','PAYMENT_PENDING',now(),now())", [id, customerId, installationId, input.plan.code]);
      return { customerEmail: input.email, installationCode: input.installationCode, subscription: { id, customerId, installationId, planCode: input.plan.code, providerSubscriptionId: null, status: "PAYMENT_PENDING", currentPeriodStart: null, currentPeriodEnd: null } };
    });
  }

  async bindProviderSubscription(id: string, providerId: string): Promise<void> { await this.pool.query("UPDATE subscriptions SET provider_subscription_id=$2,updated_at=now() WHERE id=$1 AND provider_subscription_id IS NULL", [id, providerId]); }
  async getSubscription(id: string): Promise<SubscriptionRecord | null> {
    const result = await this.pool.query("SELECT id,customer_id,installation_id,plan_code,provider_subscription_id,status,current_period_start,current_period_end FROM subscriptions WHERE id=$1", [id]);
    const row = result.rows[0]; if (!row) return null;
    return { id: row.id, customerId: row.customer_id, installationId: row.installation_id, planCode: row.plan_code, providerSubscriptionId: row.provider_subscription_id, status: row.status, currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end };
  }
  async findInstallationByCode(code: string) { const result = await this.pool.query("SELECT id,device_public_key,fingerprint,status FROM installations WHERE installation_code=$1", [code]); const row=result.rows[0]; return row ? { id:row.id,publicKey:row.device_public_key,fingerprint:row.fingerprint,status:row.status } : null; }
  async createChallenge(installationId: string, nonceHash: string, expiresAt: Date): Promise<Challenge> { const id=randomUUID(); await this.pool.query("INSERT INTO device_challenges(id,installation_id,nonce_hash,expires_at,created_at) VALUES($1,$2,$3,$4,now())",[id,installationId,nonceHash,expiresAt]); return {id,installationId,expiresAt}; }
  async consumeChallenge(id: string, installationId: string, nonceHash: string): Promise<boolean> { const result=await this.pool.query("UPDATE device_challenges SET consumed_at=now() WHERE id=$1 AND installation_id=$2 AND nonce_hash=$3 AND consumed_at IS NULL AND expires_at>now() RETURNING id",[id,installationId,nonceHash]); return result.rowCount===1; }
  async applyProviderSnapshot(snapshot: ProviderSubscriptionSnapshot) {
    return this.transaction(async client => {
      const inserted=await client.query("INSERT INTO webhook_events(id,provider,provider_event_id,event_type,status,processed_at) VALUES($1,'MERCADO_PAGO',$2,$3,'PROCESSING',NULL) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id",[randomUUID(),snapshot.providerEventId,snapshot.eventType]);
      if (!inserted.rowCount) return {duplicate:true,subscription:null};
      const result=await client.query("UPDATE subscriptions SET provider_subscription_id=$2,status=$3,current_period_start=COALESCE($4,current_period_start),current_period_end=COALESCE($5,current_period_end),updated_at=now() WHERE id=$1 RETURNING id,customer_id,installation_id,plan_code,provider_subscription_id,status,current_period_start,current_period_end",[snapshot.externalReference,snapshot.providerSubscriptionId,snapshot.status,snapshot.currentPeriodStart,snapshot.currentPeriodEnd]);
      if(snapshot.providerPaymentId) await client.query("INSERT INTO payments(id,subscription_id,provider_payment_id,amount_cents,status,paid_at,created_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(provider_payment_id) DO UPDATE SET status=excluded.status,paid_at=excluded.paid_at",[randomUUID(),snapshot.externalReference,snapshot.providerPaymentId,snapshot.amountCents,snapshot.status,snapshot.paidAt]);
      await client.query("UPDATE webhook_events SET status='PROCESSED',processed_at=now() WHERE provider='MERCADO_PAGO' AND provider_event_id=$1",[snapshot.providerEventId]);
      const row=result.rows[0]; return {duplicate:false,subscription:row?{id:row.id,customerId:row.customer_id,installationId:row.installation_id,planCode:row.plan_code,providerSubscriptionId:row.provider_subscription_id,status:row.status as SubscriptionState,currentPeriodStart:row.current_period_start,currentPeriodEnd:row.current_period_end}:null};
    });
  }
  async nextEntitlementSequence(subscriptionId: string): Promise<number> { const result=await this.pool.query<{sequence:string}>("UPDATE entitlement_sequences SET sequence=sequence+1 WHERE subscription_id=$1 RETURNING sequence",[subscriptionId]); if(result.rows[0]) return Number(result.rows[0].sequence); const inserted=await this.pool.query<{sequence:string}>("INSERT INTO entitlement_sequences(subscription_id,sequence) VALUES($1,1) ON CONFLICT(subscription_id) DO UPDATE SET sequence=entitlement_sequences.sequence+1 RETURNING sequence",[subscriptionId]); return Number(inserted.rows[0]!.sequence); }
  async recordEntitlement(input: { id:string;subscriptionId:string;installationId:string;edition:string;validFrom:Date;validUntil:Date;serverSequence:number;signedPayloadHash:string;keyId:string }) { await this.pool.query("INSERT INTO entitlements(id,subscription_id,installation_id,edition,valid_from,valid_until,server_sequence,signed_payload_hash,key_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())",[input.id,input.subscriptionId,input.installationId,input.edition,input.validFrom,input.validUntil,input.serverSequence,input.signedPayloadHash,input.keyId]); }
}
