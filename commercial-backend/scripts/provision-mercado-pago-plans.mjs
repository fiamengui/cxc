const token=process.env.MERCADO_PAGO_ACCESS_TOKEN;
const publicUrl=process.env.COMMERCIAL_PUBLIC_URL;
if(!token||token.length<20)throw new Error("MERCADO_PAGO_ACCESS_TOKEN ausente.");
if(!publicUrl||!publicUrl.startsWith("https://")||/localhost|\.invalid|example\.com/i.test(publicUrl))throw new Error("COMMERCIAL_PUBLIC_URL deve ser HTTPS real.");

const api="https://api.mercadopago.com";
const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
async function request(path,init={}){
  const response=await fetch(`${api}${path}`,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(20000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`Mercado Pago retornou HTTP ${response.status}.`);
  return body;
}
const definitions=[
  {code:"ESSENTIAL_MONTHLY",reason:"CaixaSimples - Bratec Essencial - mensal",frequency:1,amount:9.90},
  {code:"ESSENTIAL_ANNUAL",reason:"CaixaSimples - Bratec Essencial - anual",frequency:12,amount:99.90},
];
const search=await request("/preapproval_plan/search?status=active&limit=100");
const existing=Array.isArray(search.results)?search.results:[];
const result={};
for(const plan of definitions){
  const externalReference=`CNC:${plan.code}:v1`;
  let resource=existing.find(item=>item?.external_reference===externalReference);
  if(!resource){
    resource=await request("/preapproval_plan",{method:"POST",body:JSON.stringify({reason:plan.reason,external_reference:externalReference,back_url:`${publicUrl.replace(/\/$/,"")}/checkout/return`,auto_recurring:{frequency:plan.frequency,frequency_type:"months",transaction_amount:plan.amount,currency_id:"BRL"}})});
  }else{
    const expectedBackUrl=`${publicUrl.replace(/\/$/,"")}/checkout/return`;
    if(resource.back_url!==expectedBackUrl){
      resource=await request(`/preapproval_plan/${encodeURIComponent(resource.id)}`,{method:"PUT",body:JSON.stringify({back_url:expectedBackUrl})});
    }
  }
  const expectedCents=Math.round(plan.amount*100);
  const actualCents=Math.round(Number(resource?.auto_recurring?.transaction_amount)*100);
  const expectedBackUrl=`${publicUrl.replace(/\/$/,"")}/checkout/return`;
  if(!resource?.id||actualCents!==expectedCents||resource?.auto_recurring?.frequency!==plan.frequency||resource?.auto_recurring?.frequency_type!=="months"||resource?.back_url!==expectedBackUrl)throw new Error(`Plano ${plan.code} retornou configuração divergente.`);
  result[plan.code]={id:resource.id,amountCents:actualCents,frequencyMonths:plan.frequency,status:resource.status,backUrl:resource.back_url};
}
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
