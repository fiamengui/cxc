import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { BetaAccessRecord, BetaStatus, Plan, ProviderSubscriptionSnapshot, SubscriptionRecord, SubscriptionState } from "./domain.js";

export type CheckoutContextInput = { name: string; email: string; document: string | null; installationCode: string; devicePublicKey: string; deviceFingerprint: string; plan: Plan };
export type CheckoutContext = { subscription: SubscriptionRecord; customerEmail: string; installationCode: string };
export type Challenge = { id: string; installationId: string; expiresAt: Date };
type BetaRow = { id:string;invited_email:string;status:BetaStatus;customer_id:string|null;installation_id:string|null;installation_code:string|null;fingerprint:string|null;admitted_at:Date;activated_at:Date|null;client_version:string|null;last_activity_at:Date|null;admin_notes:string|null };
const betaRecord = (row:BetaRow):BetaAccessRecord => ({ id:row.id,invitedEmail:row.invited_email,status:row.status,customerId:row.customer_id,installationId:row.installation_id,installationCode:row.installation_code,fingerprint:row.fingerprint,admittedAt:row.admitted_at,activatedAt:row.activated_at,clientVersion:row.client_version,lastActivityAt:row.last_activity_at,adminNotes:row.admin_notes });

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
  createBetaInvitation(input: { codeHash: string; email: string; notes: string | null; maxCustomers: number }): Promise<{ access: BetaAccessRecord; used: number }>;
  betaCapacity(): Promise<number>;
  listBetaAccess(): Promise<BetaAccessRecord[]>;
  activateBeta(input: { codeHash: string; name: string; email: string; installationCode: string; devicePublicKey: string; fingerprint: string; clientVersion: string }): Promise<BetaAccessRecord>;
  getBetaAccess(id: string): Promise<BetaAccessRecord | null>;
  nextBetaEntitlementSequence(id: string): Promise<number>;
  recordBetaEntitlement(input: { id: string; betaAccessId: string; installationId: string; validFrom: Date; validUntil: Date; serverSequence: number; signedPayloadHash: string; keyId: string }): Promise<void>;
  updateBetaStatus(id: string, status: BetaStatus, notes: string | null): Promise<BetaAccessRecord | null>;
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

  async createBetaInvitation(input:{codeHash:string;email:string;notes:string|null;maxCustomers:number}) {
    return this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('caixasimples-bratec-beta-capacity'))");
      const count=await client.query<{count:string}>("SELECT count(*) FROM beta_access");
      const used=Number(count.rows[0]!.count);
      if(used>=input.maxCustomers) throw new Error("As vagas da beta gratuita do CaixaSimples - Bratec estão preenchidas no momento.");
      const result=await client.query<BetaRow>("INSERT INTO beta_access(id,invite_code_hash,invited_email,status,admitted_at,admin_notes,created_at,updated_at) VALUES($1,$2,lower($3),'INVITED',now(),$4,now(),now()) RETURNING id,invited_email,status,customer_id,installation_id,NULL::text installation_code,NULL::text fingerprint,admitted_at,activated_at,client_version,last_activity_at,admin_notes",[randomUUID(),input.codeHash,input.email,input.notes]);
      return {access:betaRecord(result.rows[0]!),used:used+1};
    });
  }
  async betaCapacity(){const result=await this.pool.query<{count:string}>("SELECT count(*) FROM beta_access");return Number(result.rows[0]!.count);}
  async listBetaAccess(){const result=await this.pool.query<BetaRow>("SELECT b.id,b.invited_email,b.status,b.customer_id,b.installation_id,i.installation_code,i.fingerprint,b.admitted_at,b.activated_at,b.client_version,b.last_activity_at,b.admin_notes FROM beta_access b LEFT JOIN installations i ON i.id=b.installation_id ORDER BY b.admitted_at");return result.rows.map(betaRecord);}
  async activateBeta(input:{codeHash:string;name:string;email:string;installationCode:string;devicePublicKey:string;fingerprint:string;clientVersion:string}) {
    return this.transaction(async client => {
      const invitation=await client.query<BetaRow>("SELECT b.id,b.invited_email,b.status,b.customer_id,b.installation_id,i.installation_code,i.fingerprint,b.admitted_at,b.activated_at,b.client_version,b.last_activity_at,b.admin_notes FROM beta_access b LEFT JOIN installations i ON i.id=b.installation_id WHERE b.invite_code_hash=$1 FOR UPDATE OF b",[input.codeHash]);
      const existing=invitation.rows[0];
      if(!existing || existing.invited_email.toLowerCase()!==input.email.toLowerCase()) throw new Error("Convite beta inválido para este e-mail.");
      if(existing.status==='ACTIVE') {
        if(existing.installation_code!==input.installationCode || existing.fingerprint!==input.fingerprint) throw new Error("Este convite beta já foi ativado em outra instalação.");
        await client.query("UPDATE beta_access SET last_activity_at=now(),client_version=$2,updated_at=now() WHERE id=$1",[existing.id,input.clientVersion]);
        return betaRecord({...existing,last_activity_at:new Date(),client_version:input.clientVersion});
      }
      if(existing.status!=='INVITED') throw new Error("Este convite beta não está disponível para ativação.");
      const customer=await client.query<{id:string}>("INSERT INTO customers(id,name,email,created_at) VALUES($1,$2,lower($3),now()) ON CONFLICT(email) DO UPDATE SET name=excluded.name RETURNING id",[randomUUID(),input.name,input.email]);
      const customerId=customer.rows[0]!.id;
      const installation=await client.query<{id:string}>("INSERT INTO installations(id,customer_id,installation_code,device_public_key,fingerprint,first_seen_at,last_seen_at,status) VALUES($1,$2,$3,$4,$5,now(),now(),'ACTIVE') ON CONFLICT(installation_code) DO UPDATE SET last_seen_at=now() WHERE installations.customer_id=$2 AND installations.device_public_key=$4 AND installations.fingerprint=$5 AND installations.status='ACTIVE' RETURNING id",[randomUUID(),customerId,input.installationCode,input.devicePublicKey,input.fingerprint]);
      const installationId=installation.rows[0]?.id;
      if(!installationId) throw new Error("Código de instalação já vinculado a outra identidade ou cliente.");
      const result=await client.query<BetaRow>("UPDATE beta_access SET status='ACTIVE',customer_id=$2,installation_id=$3,activated_at=now(),client_version=$4,last_activity_at=now(),updated_at=now() WHERE id=$1 RETURNING id,invited_email,status,customer_id,installation_id,$5::text installation_code,$6::text fingerprint,admitted_at,activated_at,client_version,last_activity_at,admin_notes",[existing.id,customerId,installationId,input.clientVersion,input.installationCode,input.fingerprint]);
      return betaRecord(result.rows[0]!);
    });
  }
  async getBetaAccess(id:string){const result=await this.pool.query<BetaRow>("SELECT b.id,b.invited_email,b.status,b.customer_id,b.installation_id,i.installation_code,i.fingerprint,b.admitted_at,b.activated_at,b.client_version,b.last_activity_at,b.admin_notes FROM beta_access b LEFT JOIN installations i ON i.id=b.installation_id WHERE b.id=$1",[id]);return result.rows[0]?betaRecord(result.rows[0]):null;}
  async nextBetaEntitlementSequence(id:string){const result=await this.pool.query<{sequence:string}>("UPDATE beta_access SET sequence=sequence+1,last_activity_at=now(),updated_at=now() WHERE id=$1 AND status='ACTIVE' RETURNING sequence",[id]);if(!result.rows[0])throw new Error("Acesso beta não está ativo.");return Number(result.rows[0].sequence);}
  async recordBetaEntitlement(input:{id:string;betaAccessId:string;installationId:string;validFrom:Date;validUntil:Date;serverSequence:number;signedPayloadHash:string;keyId:string}){await this.pool.query("INSERT INTO beta_entitlements(id,beta_access_id,installation_id,valid_from,valid_until,server_sequence,signed_payload_hash,key_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())",[input.id,input.betaAccessId,input.installationId,input.validFrom,input.validUntil,input.serverSequence,input.signedPayloadHash,input.keyId]);}
  async updateBetaStatus(id:string,status:BetaStatus,notes:string|null){const result=await this.pool.query<BetaRow>("UPDATE beta_access SET status=$2,admin_notes=$3,updated_at=now() WHERE id=$1 RETURNING id,invited_email,status,customer_id,installation_id,NULL::text installation_code,NULL::text fingerprint,admitted_at,activated_at,client_version,last_activity_at,admin_notes",[id,status,notes]);return result.rows[0]?betaRecord(result.rows[0]):null;}
}
