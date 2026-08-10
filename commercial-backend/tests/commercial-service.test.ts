import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EntitlementSigner, canonicalDeviceChallenge } from "../src/entitlement.js";
import type { CheckoutInput, CheckoutResult, PaymentProvider } from "../src/payment-provider.js";
import type { Challenge, CheckoutContext, CheckoutContextInput, CommercialRepository } from "../src/repository.js";
import { CommercialService } from "../src/service.js";
import type { ProviderSubscriptionSnapshot, SubscriptionRecord } from "../src/domain.js";

class MemoryRepository implements CommercialRepository {
  subscription: SubscriptionRecord | null = null;
  installation: {id:string;publicKey:string;fingerprint:string;status:string}|null = null;
  nonceHash = ""; consumed = false; sequence = 0; entitlements = 0; snapshots = 0; lastSnapshot:ProviderSubscriptionSnapshot|null=null;
  async createCheckoutContext(input:CheckoutContextInput):Promise<CheckoutContext>{ const installationId=randomUUID(); const customerId=randomUUID(); this.installation={id:installationId,publicKey:input.devicePublicKey,fingerprint:input.deviceFingerprint,status:"ACTIVE"}; this.subscription={id:randomUUID(),customerId,installationId,planCode:input.plan.code,providerSubscriptionId:null,status:"PAYMENT_PENDING",currentPeriodStart:null,currentPeriodEnd:null}; return {subscription:this.subscription,customerEmail:input.email,installationCode:input.installationCode}; }
  async bindProviderSubscription(_id:string,providerId:string){ if(this.subscription)this.subscription.providerSubscriptionId=providerId; }
  async getSubscription(id:string){return this.subscription?.id===id?this.subscription:null;}
  async findInstallationByCode(){return this.installation;}
  async createChallenge(installationId:string,nonceHash:string,expiresAt:Date):Promise<Challenge>{this.nonceHash=nonceHash;return{id:randomUUID(),installationId,expiresAt};}
  async consumeChallenge(_id:string,_installationId:string,nonceHash:string){if(this.consumed||nonceHash!==this.nonceHash)return false;this.consumed=true;return true;}
  async applyProviderSnapshot(snapshot:ProviderSubscriptionSnapshot){this.snapshots++;this.lastSnapshot=snapshot;return{duplicate:false,subscription:this.subscription};}
  async nextEntitlementSequence(){return ++this.sequence;}
  async recordEntitlement(){this.entitlements++;}
}

class FakeProvider implements PaymentProvider {
  checkoutInput:CheckoutInput|null=null; snapshot:ProviderSubscriptionSnapshot|null=null;
  async createCheckout(input:CheckoutInput){return this.createSubscription(input);}
  async createSubscription(input:CheckoutInput):Promise<CheckoutResult>{this.checkoutInput=input;return{providerSubscriptionId:"provider-1",checkoutUrl:"https://www.mercadopago.com.br/subscriptions/checkout"};}
  async getSubscriptionStatus():Promise<ProviderSubscriptionSnapshot>{throw new Error("not used");} async getPaymentStatus():Promise<ProviderSubscriptionSnapshot>{throw new Error("not used");} async cancelSubscription(){}
  async processWebhook(){if(!this.snapshot)throw new Error("missing snapshot");return this.snapshot;}
}

function fixture(){
  const keys=generateKeyPairSync("ed25519"); const path=join(tmpdir(),`cnc-entitlement-${randomUUID()}.pem`); writeFileSync(path,keys.privateKey.export({format:"pem",type:"pkcs8"}));
  const repository=new MemoryRepository(); const provider=new FakeProvider(); const signer=new EntitlementSigner({ENTITLEMENT_PRIVATE_KEY_PATH:path,ENTITLEMENT_KEY_ID:"test-key"});
  return{keys,repository,provider,service:new CommercialService(repository,provider,signer,"test-key",()=>new Date("2026-08-07T12:00:00.000Z"))};
}
const identity=(publicKey:Buffer)=>({devicePublicKey:publicKey.toString("base64"),deviceFingerprint:createHash("sha256").update(publicKey).digest("hex")});

test("carrega a chave Ed25519 de um secret base64",()=>{const keys=generateKeyPairSync("ed25519");const pem=keys.privateKey.export({format:"pem",type:"pkcs8"});assert.doesNotThrow(()=>new EntitlementSigner({ENTITLEMENT_PRIVATE_KEY_BASE64:Buffer.from(pem).toString("base64"),ENTITLEMENT_KEY_ID:"test-key"}));});

test("o preço é sempre escolhido no servidor",async()=>{const f=fixture();const device=identity(Buffer.alloc(32,1));await f.service.createCheckout({name:"Cliente",email:"cliente@example.com",document:null,installationCode:"CNC-ABCD-EFGH-IJKL",...device,planCode:"ESSENTIAL_MONTHLY"});assert.equal(f.provider.checkoutInput?.plan.amountCents,990);await assert.rejects(()=>f.service.createCheckout({name:"Cliente",email:"cliente@example.com",document:null,installationCode:"CNC-ABCD-EFGH-IJKL",...device,planCode:"HACKED"}),/Plano comercial inválido/);});

test("entitlement exige desafio válido, é de uso único e recebe sequência crescente",async()=>{const f=fixture();const device=generateKeyPairSync("ed25519");const raw=device.publicKey.export({format:"der",type:"spki"}).subarray(-32);await f.service.createCheckout({name:"Cliente",email:"cliente@example.com",document:null,installationCode:"CNC-ABCD-EFGH-IJKL",...identity(raw),planCode:"ESSENTIAL_ANNUAL"});f.repository.subscription!.status="ACTIVE";f.repository.subscription!.currentPeriodEnd=new Date("2027-08-07T12:00:00.000Z");const requestId="request-123456";const challenge=await f.service.createChallenge("CNC-ABCD-EFGH-IJKL","entitlement.refresh",requestId);const input={installationCode:"CNC-ABCD-EFGH-IJKL",subscriptionId:f.repository.subscription!.id,challengeId:challenge.challengeId,nonce:challenge.nonce,requestId,timestamp:"2026-08-07T12:00:00.000Z",action:"entitlement.refresh"};const signature=sign(null,Buffer.from(canonicalDeviceChallenge(input)),device.privateKey).toString("base64");const entitlement=await f.service.refreshEntitlement({...input,signature});assert.equal(entitlement.payload.serverSequence,1);assert.equal(entitlement.payload.validUntil,"2026-09-06T12:00:00.000Z");await assert.rejects(()=>f.service.refreshEntitlement({...input,signature}),/já utilizado/);});

test("webhook com valor divergente não altera a assinatura",async()=>{const f=fixture();await f.service.createCheckout({name:"Cliente",email:"cliente@example.com",document:null,installationCode:"CNC-ABCD-EFGH-IJKL",...identity(Buffer.alloc(32,2)),planCode:"ESSENTIAL_MONTHLY"});f.provider.snapshot={providerEventId:"event-1",providerSubscriptionId:"provider-1",externalReference:f.repository.subscription!.id,status:"ACTIVE",amountCents:100,currentPeriodStart:null,currentPeriodEnd:null,paidAt:new Date(),providerPaymentId:"payment-1",eventType:"payment"};await assert.rejects(()=>f.service.processWebhook({xSignature:"x",xRequestId:"r",dataId:"1",body:{}}),/diverge/);assert.equal(f.repository.snapshots,0);});

test("pagamento aprovado cria período mensal e falha posterior respeita a tolerância",async()=>{const f=fixture();await f.service.createCheckout({name:"Cliente",email:"cliente@example.com",document:null,installationCode:"CNC-ABCD-EFGH-IJKL",...identity(Buffer.alloc(32,3)),planCode:"ESSENTIAL_MONTHLY"});f.provider.snapshot={providerEventId:"event-ok",providerSubscriptionId:"provider-1",externalReference:f.repository.subscription!.id,status:"ACTIVE",amountCents:990,currentPeriodStart:null,currentPeriodEnd:null,paidAt:new Date("2026-08-07T12:00:00Z"),providerPaymentId:"payment-ok",eventType:"payment"};await f.service.processWebhook({xSignature:"x",xRequestId:"r",dataId:"1",body:{}});assert.equal(f.repository.lastSnapshot?.currentPeriodEnd?.toISOString(),"2026-09-07T12:00:00.000Z");f.repository.subscription!.status="ACTIVE";f.repository.subscription!.currentPeriodStart=new Date("2026-08-07T12:00:00Z");f.repository.subscription!.currentPeriodEnd=new Date("2026-08-07T11:00:00Z");f.provider.snapshot={...f.provider.snapshot,providerEventId:"event-failed",status:"PAYMENT_FAILED",amountCents:990,paidAt:null,providerPaymentId:"payment-failed"};await f.service.processWebhook({xSignature:"x",xRequestId:"r",dataId:"2",body:{}});assert.equal(f.repository.lastSnapshot?.status,"GRACE_PERIOD");assert.equal(f.repository.lastSnapshot?.currentPeriodEnd?.toISOString(),"2026-08-12T11:00:00.000Z");});

test("renovação mensal aprovada abre o período seguinte",async()=>{const f=fixture();await f.service.createCheckout({name:"Cliente",email:"cliente@example.com",document:null,installationCode:"CNC-ABCD-EFGH-IJKL",...identity(Buffer.alloc(32,4)),planCode:"ESSENTIAL_MONTHLY"});f.repository.subscription!.status="ACTIVE";f.repository.subscription!.currentPeriodStart=new Date("2026-08-07T12:00:00Z");f.repository.subscription!.currentPeriodEnd=new Date("2026-09-07T12:00:00Z");f.provider.snapshot={providerEventId:"event-renewal",providerSubscriptionId:"provider-1",externalReference:f.repository.subscription!.id,status:"ACTIVE",amountCents:990,currentPeriodStart:null,currentPeriodEnd:null,paidAt:new Date("2026-09-07T12:00:00Z"),providerPaymentId:"payment-renewal",eventType:"payment"};await f.service.processWebhook({xSignature:"x",xRequestId:"r",dataId:"3",body:{}});assert.equal(f.repository.lastSnapshot?.status,"ACTIVE");assert.equal(f.repository.lastSnapshot?.currentPeriodStart?.toISOString(),"2026-09-07T12:00:00.000Z");assert.equal(f.repository.lastSnapshot?.currentPeriodEnd?.toISOString(),"2026-10-07T12:00:00.000Z");});

test("reembolso e chargeback revogam o direito de uso",async()=>{for(const [index,eventType] of ["refund","chargeback"].entries()){const f=fixture();await f.service.createCheckout({name:"Cliente",email:"cliente@example.com",document:null,installationCode:`CNC-ABCD-EFGH-IJK${index}`,...identity(Buffer.alloc(32,5+index)),planCode:"ESSENTIAL_MONTHLY"});f.repository.subscription!.status="ACTIVE";f.repository.subscription!.currentPeriodStart=new Date("2026-08-07T12:00:00Z");f.repository.subscription!.currentPeriodEnd=new Date("2026-09-07T12:00:00Z");f.provider.snapshot={providerEventId:`event-${eventType}`,providerSubscriptionId:"provider-1",externalReference:f.repository.subscription!.id,status:"REFUNDED",amountCents:990,currentPeriodStart:null,currentPeriodEnd:null,paidAt:new Date("2026-08-07T12:00:00Z"),providerPaymentId:`payment-${eventType}`,eventType};await f.service.processWebhook({xSignature:"x",xRequestId:"r",dataId:String(index),body:{}});assert.equal(f.repository.lastSnapshot?.status,"REFUNDED")}});
