import path from "node:path";
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
      const result=await runPncpBoundedDiscovery({
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
