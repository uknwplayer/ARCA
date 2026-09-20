import {createHash} from "node:crypto";
import {createA2aRegistryResolver} from "../packages/agent/src/a2a-registry-resolution.ts";

const apiOrigin=String(process.env.ARCA_A2A_REGISTRY_API_ORIGIN??"").trim();
const ids=String(process.env.ARCA_A2A_REGISTRY_IDS??"")
  .split(",")
  .map(value=>value.trim())
  .filter(Boolean);
if(!apiOrigin)throw new Error("ARCA_A2A_REGISTRY_API_ORIGIN is required");
if(ids.length<1||ids.length>5)throw new Error("ARCA_A2A_REGISTRY_IDS must contain between 1 and 5 ids");

const resolver=createA2aRegistryResolver({
  sourceId:"live-a2a-registry-resolution",
  apiOrigin,
  networkEnabled:true,
  allowedOrigins:[apiOrigin],
  timeoutMs:15000,
  maxResponseBytes:512*1024
});

const resolutions=[];
for(const id of ids){
  const result=await resolver.resolve(id);
  if(
    result.trustState!=="untrusted"||
    result.admissionState!=="not-admitted"||
    result.candidateCreated!==false||
    result.candidateExecuted!==false||
    result.manifestFetched!==false||
    result.trustGranted!==false||
    result.admissionGranted!==false||
    result.dispatchAuthorized!==false
  ){
    throw new Error("live A2A registry resolution crossed the discovery trust boundary");
  }
  resolutions.push(result);
}

process.stdout.write(JSON.stringify({
  ok:true,
  sourceKind:"a2a-registry-public-resolution",
  sourceOrigin:new URL(apiOrigin).origin,
  resolutionCount:resolutions.length,
  resolutions:resolutions.map(result=>({
    requestedIdSha256:createHash("sha256").update(result.requestedRegistryId).digest("hex"),
    registryId:result.registryId,
    displayName:result.displayName,
    packageName:result.packageName,
    manifestUrl:result.manifestUrl,
    manifestReferencePresent:result.manifestReferencePresent,
    trustState:result.trustState,
    admissionState:result.admissionState,
    candidateCreated:false,
    candidateExecuted:false,
    manifestFetched:false,
    trustGranted:false,
    admissionGranted:false,
    dispatchAuthorized:false
  }))
})+"\n");
