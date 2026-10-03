import {ARCA_OPENAI_DEFAULT_MODEL} from "./openai-provider.ts";

export const ARCA_TERMUX_GEMINI_DEFAULT_MODEL="gemini-2.5-flash";

const PROVIDERS=Object.freeze([
  Object.freeze({
    id:"offline",
    label:"Offline",
    external:false,
    apiKeyRequired:false,
    apiKeyEnv:null,
    defaultModel:null,
    monetaryBudgetRequired:false,
    freeTierEligible:true,
    freeTierGuaranteed:true
  }),
  Object.freeze({
    id:"gemini",
    label:"Google Gemini",
    external:true,
    apiKeyRequired:true,
    apiKeyEnv:"GEMINI_API_KEY",
    defaultModel:ARCA_TERMUX_GEMINI_DEFAULT_MODEL,
    monetaryBudgetRequired:false,
    freeTierEligible:true,
    freeTierGuaranteed:false
  }),
  Object.freeze({
    id:"openai",
    label:"OpenAI",
    external:true,
    apiKeyRequired:true,
    apiKeyEnv:"OPENAI_API_KEY",
    defaultModel:ARCA_OPENAI_DEFAULT_MODEL,
    monetaryBudgetRequired:true,
    freeTierEligible:false,
    freeTierGuaranteed:false
  })
]);

export function listTermuxChatProviders(){
  return PROVIDERS;
}

export function resolveTermuxChatProvider(value="offline"){
  const id=String(value??"offline").trim().toLowerCase()||"offline";
  const provider=PROVIDERS.find(item=>item.id===id);
  if(!provider){
    const error=new Error("Provedor de chat Termux desconhecido: "+id);
    error.code="ARCA_TERMUX_CHAT_PROVIDER_UNKNOWN";
    throw error;
  }
  return provider;
}
