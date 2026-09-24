export const ARCA_OPENAI_PRICING_FORMAT="arca-openai-pricing-snapshot-v1";
export const ARCA_PAID_API_BUDGET_DECISION_FORMAT="arca-paid-api-budget-decision-v1";

const PRICING_AS_OF="2026-09-24";
const MAX_SNAPSHOT_AGE_DAYS=30;
const USD_EPSILON=1e-12;

const PRICING=Object.freeze({
  "gpt-6-luna":Object.freeze({
    inputUsdPerMillion:0.10,
    cachedInputUsdPerMillion:0.01,
    outputUsdPerMillion:0.50
  }),
  "gpt-6-sol":Object.freeze({
    inputUsdPerMillion:2.00,
    cachedInputUsdPerMillion:0.20,
    outputUsdPerMillion:10.00
  }),
  "gpt-6-astra":Object.freeze({
    inputUsdPerMillion:10.00,
    cachedInputUsdPerMillion:1.00,
    outputUsdPerMillion:50.00
  })
});

function money(value,label){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0||n>1000)throw new RangeError(label+" must be > 0 and <= 1000 USD");
  return n;
}
function nonNegativeInt(value,label){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0)throw new RangeError("invalid "+label);
  return n;
}
function pricingFor(model){
  const id=String(model??"").trim();
  const pricing=PRICING[id];
  if(!pricing){
    const error=new Error("OpenAI pricing unknown for model: "+id);
    error.code="ARCA_OPENAI_PRICING_UNKNOWN";
    throw error;
  }
  return {id,pricing};
}
function snapshotAgeDays(now){
  const current=new Date(now??new Date().toISOString());
  const snapshot=new Date(PRICING_AS_OF+"T00:00:00.000Z");
  if(Number.isNaN(current.getTime()))throw new TypeError("invalid pricing check time");
  return Math.floor((current.getTime()-snapshot.getTime())/86400000);
}
function assertFresh(now){
  const age=snapshotAgeDays(now);
  if(age<0)return age;
  if(age>MAX_SNAPSHOT_AGE_DAYS){
    const error=new Error("OpenAI pricing snapshot is stale; refresh prices before paid execution");
    error.code="ARCA_OPENAI_PRICING_SNAPSHOT_STALE";
    error.pricingAsOf=PRICING_AS_OF;
    error.ageDays=age;
    throw error;
  }
  return age;
}
function usd(tokens,ratePerMillion){return (tokens/1_000_000)*ratePerMillion}
function roundUsd(value){return Number(value.toFixed(9))}

export function getOpenAIPricingSnapshot(){
  return Object.freeze({
    format:ARCA_OPENAI_PRICING_FORMAT,
    version:1,
    asOf:PRICING_AS_OF,
    maxAgeDays:MAX_SNAPSHOT_AGE_DAYS,
    currency:"USD",
    serviceTier:"standard",
    contextBand:"short-under-272k",
    source:"https://developers.openai.com/api/docs/pricing",
    models:PRICING
  });
}

export function evaluatePaidOpenAIBudget({
  model,
  inputText,
  instructionsText="",
  maxOutputTokens,
  allowPaidApi=false,
  maxRequestUsd,
  now
}={}){
  if(allowPaidApi!==true){
    const error=new Error("paid API execution requires explicit --allow-paid-api");
    error.code="ARCA_PAID_API_NOT_AUTHORIZED";
    throw error;
  }
  const cap=money(maxRequestUsd,"maxRequestUsd");
  const {id,pricing}=pricingFor(model);
  const ageDays=assertFresh(now);
  const inputBytes=Buffer.byteLength(String(inputText??"")+String(instructionsText??""),"utf8");
  const outputTokens=nonNegativeInt(maxOutputTokens,"maxOutputTokens");
  const conservativeInputTokenUpperBound=inputBytes;
  const conservativeMaxUsd=
    usd(conservativeInputTokenUpperBound,pricing.inputUsdPerMillion)+
    usd(outputTokens,pricing.outputUsdPerMillion);
  if(conservativeMaxUsd-cap>USD_EPSILON){
    const error=new Error("paid API request exceeds configured maxRequestUsd");
    error.code="ARCA_PAID_API_BUDGET_EXCEEDED";
    error.maxRequestUsd=cap;
    error.conservativeMaxUsd=roundUsd(conservativeMaxUsd);
    throw error;
  }
  return Object.freeze({
    format:ARCA_PAID_API_BUDGET_DECISION_FORMAT,
    version:1,
    allowed:true,
    monetaryChargePossible:true,
    explicitPaidAuthorization:true,
    model:id,
    pricingAsOf:PRICING_AS_OF,
    pricingSnapshotAgeDays:ageDays,
    maxRequestUsd:roundUsd(cap),
    conservativeInputTokenUpperBound,
    maxOutputTokens:outputTokens,
    conservativeMaxUsd:roundUsd(conservativeMaxUsd),
    estimateMethod:"utf8-bytes-as-input-token-upper-bound",
    billingCapGuaranteed:false
  });
}

export function estimateOpenAIUsageUsd({model,usage}={}){
  const {id,pricing}=pricingFor(model);
  const input=nonNegativeInt(usage?.input_tokens??0,"input_tokens");
  const cached=Math.min(input,nonNegativeInt(usage?.cached_input_tokens??0,"cached_input_tokens"));
  const output=nonNegativeInt(usage?.output_tokens??0,"output_tokens");
  const uncached=input-cached;
  return Object.freeze({
    model:id,
    inputTokens:input,
    cachedInputTokens:cached,
    outputTokens:output,
    estimatedUsd:roundUsd(
      usd(uncached,pricing.inputUsdPerMillion)+
      usd(cached,pricing.cachedInputUsdPerMillion)+
      usd(output,pricing.outputUsdPerMillion)
    ),
    pricingAsOf:PRICING_AS_OF,
    exactBillingAmount:false
  });
}
