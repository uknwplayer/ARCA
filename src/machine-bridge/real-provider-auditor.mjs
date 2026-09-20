import {createProviderHttpInvoker} from "./provider-http-adapter.mjs";import {codecFor} from "./provider-codecs.mjs";import {createProviderReasoner} from "./provider-reasoner.mjs";import {createToolEnabledAuditorAdapter} from "./tool-enabled-auditor-adapter.mjs";
export function createRealProviderAuditor({agentId,provider,model,apiKey,endpoint,tools,fetchImpl,maxToolCalls=8}){
 const codec=codecFor(provider,model);
 const invoke=createProviderHttpInvoker({provider,apiKey,endpoint,fetchImpl,encodeRequest:codec.encode,decodeResponse:codec.decode});
 const reasoner=createProviderReasoner({provider,model,invoke});
 return createToolEnabledAuditorAdapter({agentId,provider,model,tools,maxToolCalls,reason:reasoner.reason});
}
