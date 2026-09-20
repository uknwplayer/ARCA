const PROVIDERS=Object.freeze({
 openai:{endpoint:"https://api.openai.com/v1/responses",auth:(k)=>({"Authorization":"Bearer "+k})},
 anthropic:{endpoint:"https://api.anthropic.com/v1/messages",auth:(k)=>({"x-api-key":k,"anthropic-version":"2023-06-01"})},
 gemini:{endpoint:"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",auth:(k)=>({"Authorization":"Bearer "+k})},
 meta:{endpoint:null,auth:(k)=>({"Authorization":"Bearer "+k})},
 grok:{endpoint:"https://api.x.ai/v1/chat/completions",auth:(k)=>({"Authorization":"Bearer "+k})}
});
export function providerDescriptor(id){const p=PROVIDERS[id];if(!p)throw new Error("ARCA_PROVIDER_UNSUPPORTED");return Object.freeze({id,endpoint:p.endpoint,requiresConfiguredEndpoint:p.endpoint===null});}
export function createProviderHttpInvoker({provider,apiKey,endpoint,fetchImpl=globalThis.fetch,encodeRequest,decodeResponse}){
 const p=PROVIDERS[provider];if(!p)throw new Error("ARCA_PROVIDER_UNSUPPORTED");
 if(!apiKey||typeof fetchImpl!=="function"||typeof encodeRequest!=="function"||typeof decodeResponse!=="function")throw new Error("ARCA_PROVIDER_HTTP_INVALID_CONFIG");
 const target=endpoint??p.endpoint;if(!target)throw new Error("ARCA_PROVIDER_ENDPOINT_REQUIRED");
 const u=new URL(target);if(u.protocol!=="https:")throw new Error("ARCA_PROVIDER_HTTPS_REQUIRED");
 return async request=>{
  const response=await fetchImpl(target,{method:"POST",headers:{"content-type":"application/json",...p.auth(apiKey)},body:JSON.stringify(encodeRequest(request))});
  if(!response.ok)throw new Error("ARCA_PROVIDER_HTTP_FAILED_"+response.status);
  return decodeResponse(await response.json());
 };
}
