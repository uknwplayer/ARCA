import {readProviderConfig,publicProviderConfig} from "./provider-config.mjs";import {createRealProviderAuditor} from "./real-provider-auditor.mjs";
export function createProviderRegistry({env=process.env,toolsByAgent={},fetchImpl=globalThis.fetch,endpoints={}}={}){
 const configs=readProviderConfig(env),byId=new Map(configs.map(x=>[x.id,x]));
 return Object.freeze({
  available:()=>publicProviderConfig(configs),
  create({agentId,provider,maxToolCalls=8}){
   const c=byId.get(provider);if(!c)throw new Error("ARCA_PROVIDER_NOT_PROVISIONED");
   const tools=toolsByAgent[agentId];if(!tools)throw new Error("ARCA_PROVIDER_AGENT_TOOLS_REQUIRED");
   return createRealProviderAuditor({agentId,provider,model:c.model,apiKey:c.apiKey,endpoint:endpoints[provider],tools,fetchImpl,maxToolCalls});
  }
 });
}
