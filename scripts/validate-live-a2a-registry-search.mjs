import {createHash} from "node:crypto";
import {createA2aRegistrySearchSource} from "../packages/agent/src/a2a-registry-search.ts";

const apiOrigin=String(process.env.ARCA_A2A_REGISTRY_API_ORIGIN??"").trim();
const query=String(process.env.ARCA_A2A_REGISTRY_QUERY??"").trim();
const maxResults=Number(process.env.ARCA_A2A_REGISTRY_MAX_RESULTS??5);
if(!apiOrigin)throw new Error("ARCA_A2A_REGISTRY_API_ORIGIN is required");
if(!query)throw new Error("ARCA_A2A_REGISTRY_QUERY is required");

const source=createA2aRegistrySearchSource({
  sourceId:"live-a2a-registry-search",
  apiOrigin,
  query,
  networkEnabled:true,
  allowedOrigins:[apiOrigin],
  timeoutMs:15000,
  maxResponseBytes:512*1024,
  maxResults
});
const result=await source.search();
if(result.hitCount<1)throw new Error("live A2A registry search yielded no hits");
if(
  result.trustGranted!==false||
  result.admissionGranted!==false||
  result.candidateCreated!==false||
  result.candidateExecuted!==false||
  result.dispatchAuthorized!==false
){
  throw new Error("live A2A registry search crossed the discovery trust boundary");
}
for(const hit of result.hits){
  if(
    hit.trustState!=="untrusted"||
    hit.admissionState!=="not-admitted"||
    hit.candidateCreated!==false||
    hit.candidateExecuted!==false||
    hit.trustGranted!==false||
    hit.admissionGranted!==false||
    hit.dispatchAuthorized!==false
  ){
    throw new Error("live A2A registry search hit crossed the discovery trust boundary");
  }
}

process.stdout.write(JSON.stringify({
  ok:true,
  sourceKind:result.sourceKind,
  sourceOrigin:result.sourceOrigin,
  querySha256:createHash("sha256").update(query).digest("hex"),
  hitCount:result.hitCount,
  hitIdentifiers:result.hits.map(hit=>hit.registryId),
  manifestReferenceCount:result.hits.filter(hit=>hit.manifestUrl!==null).length,
  trustGranted:false,
  admissionGranted:false,
  candidateCreated:false,
  candidateExecuted:false,
  dispatchAuthorized:false
})+"\n");
