import {createHash,randomUUID} from "node:crypto";
import {classifyPrivacyRecord} from "./privacy-classification.ts";
import {
  ARCA_REASONING_PROVIDER_RESULT_FORMAT,
  ReasoningProviderRegistry
} from "./reasoning-capability.ts";
import {createReasoningTransportProfile} from "./reasoning-transport-gate.ts";
import {
  ARCA_OPENAI_DEFAULT_MODEL,
  createOpenAIProviderClient
} from "./openai-provider.ts";
import {evaluatePaidOpenAIBudget,estimateOpenAIUsageUsd} from "./openai-paid-budget.ts";

export const ARCA_TERMUX_GPT_ASK_FORMAT="arca-termux-gpt-ask-v1";
export const ARCA_TERMUX_GPT_PROVIDER_ID="openai.responses.termux";

function sha256(value){return createHash("sha256").update(String(value)).digest("hex")}
function message(value){
  const text=String(value??"").trim();
  if(!text)throw new TypeError("ARCA ask exige mensagem");
  if(text.length>16000)throw new RangeError("ARCA ask limita a mensagem a 16000 caracteres");
  return text;
}

export async function runOpenAITermuxAsk({
  message:inputMessage,
  apiKey,
  model=ARCA_OPENAI_DEFAULT_MODEL,
  allowExternal=false,
  allowPaidApi=false,
  maxRequestUsd,
  fetchImpl=globalThis.fetch,
  timeoutMs=30000,
  maxOutputTokens=1200,
  requestId=null,
  now
}={}){
  const text=message(inputMessage);
  if(allowExternal!==true){
    const error=new Error("ARCA ask recusou envio externo: use --allow-external conscientemente");
    error.code="ARCA_TERMUX_GPT_EXTERNAL_NOT_AUTHORIZED";
    throw error;
  }

  const providerInstructions="You are connected through the ARCA reasoning boundary. Answer the user's request. Do not claim that you executed tools, changed ARCA state, or mutated the Core unless the host separately provides verified execution evidence.";
  const budgetDecision=evaluatePaidOpenAIBudget({
    model,
    inputText:text,
    instructionsText:providerInstructions,
    maxOutputTokens,
    allowPaidApi,
    maxRequestUsd,
    now
  });

  const client=createOpenAIProviderClient({
    apiKey,model,fetchImpl,timeoutMs,maxOutputTokens
  });
  const transport=createReasoningTransportProfile({
    transportId:"openai.responses.direct",
    kind:"private-direct",
    persistence:"ephemeral",
    relayVisibility:"none",
    encryption:"tls",
    external:true,
    operator:"openai"
  });
  const providers=new ReasoningProviderRegistry();
  const descriptor=providers.register({
    providerId:ARCA_TERMUX_GPT_PROVIDER_ID,
    name:"OpenAI Responses via ARCA Termux",
    provider:"openai",
    model:client.model,
    kind:"model",
    transport,
    timeoutMs,
    maxOutputBytes:256*1024
  },async request=>{
    const response=await client.generateText({
      prompt:request.instruction,
      instructions:providerInstructions
    });
    return {
      format:ARCA_REASONING_PROVIDER_RESULT_FORMAT,
      requestId:request.requestId,
      payloadId:request.payloadId,
      status:"completed",
      output:{
        text:response.text,
        provider:response.provider,
        model:response.model,
        responseId:response.responseId,
        responseStatus:response.responseStatus,
        usage:response.usage
      },
      humanReviewRequired:true,
      coreMutationPerformed:false
    };
  });

  const rid=requestId??("termux.ask."+randomUUID());
  const payloadId="termux.ask.payload."+sha256(rid);
  const classification=classifyPrivacyRecord({
    recordId:payloadId,
    subjectType:"mixed",
    sourceType:"user-provided",
    privacyClass:"restricted",
    purpose:"Termux interactive reasoning through ARCA",
    indicators:{
      privateCommunication:true,
      canMinimize:false
    },
    sourceRefs:["termux:arca-ask"]
  });

  const reasoning=await providers.run(ARCA_TERMUX_GPT_PROVIDER_ID,{
    requestId:rid,
    payloadId,
    instruction:text,
    context:{channel:"arca-termux-cli",mode:"one-shot"},
    responseFormat:"text",
    classification,
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true,
    publicPayloadApproved:false
  });

  const output=reasoning.output;
  const usageAvailable=!!output?.usage&&Number.isFinite(Number(output.usage.input_tokens))&&Number.isFinite(Number(output.usage.output_tokens));
  const usageCost=usageAvailable?estimateOpenAIUsageUsd({model:client.model,usage:output.usage}):null;
  const accountedUsd=usageCost?.estimatedUsd??budgetDecision.conservativeMaxUsd;
  return Object.freeze({
    format:ARCA_TERMUX_GPT_ASK_FORMAT,
    version:1,
    requestId:rid,
    providerId:descriptor.providerId,
    provider:"openai",
    model:client.model,
    text:String(output?.text??""),
    usage:output?.usage??null,
    responseId:output?.responseId??null,
    cost:Object.freeze({
      currency:"USD",
      pricingAsOf:budgetDecision.pricingAsOf,
      maxRequestUsd:budgetDecision.maxRequestUsd,
      conservativeMaxUsd:budgetDecision.conservativeMaxUsd,
      actualEstimatedUsd:usageCost?.estimatedUsd??null,
      accountedUsd,
      usageAvailable,
      billingCapGuaranteed:false,
      exactBillingAmount:false
    }),
    payloadHash:reasoning.payloadHash,
    transportDecisionHash:reasoning.transportDecisionHash,
    sourceNetworkUsed:true,
    externalProcessingAuthorized:true,
    outputPersisted:false,
    humanReviewRequired:true,
    coreMutationPerformed:false
  });
}
