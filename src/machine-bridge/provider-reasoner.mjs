const STEP_KINDS=new Set(["tool","final"]);
export function createProviderReasoner({provider,model,invoke,maxInputBytes=128000}){
 if(!provider||!model||typeof invoke!=="function")throw new Error("ARCA_MBDP_PROVIDER_INVALID_CONFIG");
 return Object.freeze({provider,model,async reason(context){
  const serialized=JSON.stringify(context);
  if(Buffer.byteLength(serialized)>maxInputBytes)throw new Error("ARCA_MBDP_PROVIDER_INPUT_TOO_LARGE");
  const request=Object.freeze({format:"arca-mbdp-provider-request-v1",version:1,provider,model,context});
  const raw=await invoke(request);
  if(!raw||!STEP_KINDS.has(raw.kind))throw new Error("ARCA_MBDP_PROVIDER_INVALID_RESPONSE");
  if(raw.kind==="tool"){
   if(typeof raw.name!=="string"||!raw.name.startsWith("audit_"))throw new Error("ARCA_MBDP_PROVIDER_TOOL_DENIED");
   return {kind:"tool",name:raw.name,args:raw.args??{}};
  }
  if(typeof raw.body!=="string"||!raw.body.trim())throw new Error("ARCA_MBDP_PROVIDER_INVALID_FINAL");
  return {kind:"final",type:raw.type??"analysis",body:raw.body,evidenceRefs:Array.isArray(raw.evidenceRefs)?raw.evidenceRefs:[]};
 }});
}
