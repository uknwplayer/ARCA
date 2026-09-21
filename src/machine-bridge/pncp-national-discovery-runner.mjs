import path from "node:path";
import {createHash} from "node:crypto";
import {runPncpBoundedDiscovery} from "../../packages/pncp-connector/src/discovery.ts";

export const PNCP_NATIONAL_RUNNER_SCHEMA="arca.pncp-national-discovery-runner.v0.1";
export const PNCP_NATIONAL_NETWORK_CONFIRMATION="PNCP_PUBLIC_GET_ONLY";

function required(value,field,max=160){
  const text=String(value??"").normalize("NFKC").trim();
  if(!text||text.length>max||/[\u0000-\u001f\u007f]/.test(text))
    throw new Error(`ARCA_PNCP_NATIONAL_RUNNER_INVALID_${field}`);
  return text;
}

function validateShard(shard){
  if(!/^BR-UF-[A-Z]{2}$/.test(shard?.shardId)||!shard?.discovery||
     shard.discovery.scope?.uf!==shard.uf||
     shard.discovery.format!=="arca-pncp-discovery-plan-v2")
    throw new Error("ARCA_PNCP_NATIONAL_RUNNER_SHARD_INVALID");
  return shard;
}

const SOURCE_UNAVAILABLE_CODES=new Set([
  "UND_ERR_CONNECT_TIMEOUT","UND_ERR_HEADERS_TIMEOUT","UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET","ECONNRESET","ETIMEDOUT","ECONNREFUSED","EHOSTUNREACH",
  "ENETUNREACH","EAI_AGAIN","ENOTFOUND"
]);

function nestedCode(error){
  for(const value of [error?.code,error?.cause?.code,error?.cause?.cause?.code]){
    const code=String(value??"").trim().toUpperCase();
    if(/^[A-Z][A-Z0-9_]{2,96}$/.test(code))return code;
  }
  return null;
}
function safeErrorRef(error){
  const code=nestedCode(error);
  if(code)return `code:${code}`;
  return "sha256:"+createHash("sha256")
    .update(String(error?.message??error??"unknown"))
    .digest("hex");
}
function isSourceUnavailable(error){
  const code=nestedCode(error);
  if(code&&SOURCE_UNAVAILABLE_CODES.has(code))return true;
  const name=String(error?.name??"");
  if(name==="TimeoutError"||name==="AbortError")return true;
  const message=String(error?.message??"").toLowerCase();
  if(message==="fetch failed"||message.includes("aborted due to timeout"))return true;
  const http=/\bhttp\s+(\d{3})\b/i.exec(message);
  if(http){
    const status=Number(http[1]);
    if(status===429||(status>=500&&status<=599))return true;
  }
  return false;
}
function sourceUnavailableError(error){
  const wrapped=new Error("ARCA_PNCP_SOURCE_UNAVAILABLE");
  wrapped.code="ARCA_PNCP_SOURCE_UNAVAILABLE";
  wrapped.sourceFailureRef=safeErrorRef(error);
  return wrapped;
}

export function createPncpNationalDiscoveryRunner({
  custodyRoot,
  stagingRoot,
  transportFactory,
  actor={id:"pncp-national-observer",role:"authorized-pncp-public-worker"},
  networkEnabled=false,
  authorizePublicNetwork=false,
  confirmation=null
}={}){
  const custody=path.resolve(required(custodyRoot,"CUSTODY_ROOT",4096));
  const staging=path.resolve(required(stagingRoot,"STAGING_ROOT",4096));
  if(typeof transportFactory!=="function")
    throw new Error("ARCA_PNCP_NATIONAL_RUNNER_TRANSPORT_FACTORY_REQUIRED");
  if(typeof networkEnabled!=="boolean")
    throw new Error("ARCA_PNCP_NATIONAL_RUNNER_NETWORK_MODE_INVALID");
  if(networkEnabled&&
     (authorizePublicNetwork!==true||confirmation!==PNCP_NATIONAL_NETWORK_CONFIRMATION))
    throw new Error("ARCA_PNCP_NATIONAL_RUNNER_NETWORK_NOT_AUTHORIZED");
  const safeActor=Object.freeze({
    id:required(actor?.id,"ACTOR_ID"),
    role:required(actor?.role,"ACTOR_ROLE",80)
  });

  return Object.freeze({
    schema:PNCP_NATIONAL_RUNNER_SCHEMA,
    networkEnabled,

    async run(rawShard){
      const shard=validateShard(rawShard);
      const transport=await transportFactory(shard);
      if(!transport||typeof transport.get!=="function"||
         transport.networkEnabled!==networkEnabled)
        throw new Error("ARCA_PNCP_NATIONAL_RUNNER_TRANSPORT_MODE_MISMATCH");

      const start=shard.discovery.scope.dataInicial;
      const investigationId=`INV-PNCP-NATIONAL-${start}-${shard.uf}`;
      const sourceId=`SRC-PNCP-DISCOVERY-${shard.uf}`;
      let result;
      try{
        result=await runPncpBoundedDiscovery({
          ...shard.discovery.scope,
          modalidadeIds:shard.discovery.modalidadeIds,
          investigationId,
          sourceId,
          authorizePublicNetwork:networkEnabled&&authorizePublicNetwork
        },{
          ...shard.discovery.budgets,
          modalidadeIds:shard.discovery.modalidadeIds,
          transport,
          custodyHome:path.join(custody,shard.shardId),
          stagingRoot:path.join(staging,shard.shardId),
          actor:safeActor
        });
      }catch(error){
        if(networkEnabled&&isSourceUnavailable(error))
          throw sourceUnavailableError(error);
        throw error;
      }
      if(result.scope?.uf!==shard.uf)
        throw new Error("ARCA_PNCP_NATIONAL_RUNNER_RESULT_SCOPE_MISMATCH");
      return Object.freeze({
        ...result,
        investigationId,
        sourceId,
        shardId:shard.shardId
      });
    }
  });
}
