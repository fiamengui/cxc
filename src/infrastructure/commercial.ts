import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export type CommercialPlan = { code:"ESSENTIAL_MONTHLY"|"ESSENTIAL_ANNUAL"; name:string; billingCycle:"MONTHLY"|"ANNUAL"; amountCents:number; offlineLeaseDays:number; gracePeriodDays:number };
export type CommercialStatus = { installationCode:string; subscriptionId:string|null; state:string; planCode:string|null; validUntil:string|null; offline:boolean; requiresOnlineValidation:boolean };
export type CheckoutInput = { name:string; email:string; document:string|null; planCode:CommercialPlan["code"] };
export type CheckoutResponse = { subscriptionId:string; checkoutUrl:string; status:"PAYMENT_PENDING" };

export const getCommercialPlans=()=>invoke<CommercialPlan[]>("commercial_plans");
export const getCommercialStatus=()=>invoke<CommercialStatus>("commercial_status");
export const refreshCommercialEntitlement=()=>invoke<CommercialStatus>("commercial_refresh_entitlement");
export async function createCommercialCheckout(input:CheckoutInput){const result=await invoke<CheckoutResponse>("commercial_create_checkout",{input});await openUrl(result.checkoutUrl);return result;}
