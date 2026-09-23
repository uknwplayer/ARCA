#!/usr/bin/env node
import {ExecutionEndpointRegistry} from "../src/machine-bridge/execution-endpoint.mjs";
import {createChatGPTWorkGitHubTriggerEndpoint} from "../src/machine-bridge/work-github-trigger-endpoint.mjs";
import {
  probeVinceV5Heartbeat,
  selectVinceV5Route
} from "../src/machine-bridge/vince-v5-endpoint-availability.mjs";

function required(name){
  const value=String(process.env[name]??"").trim();
  if(!value)throw new Error(`missing required environment: ${name}`);
  return value;
}

const token=required("ARCA_GITHUB_TOKEN");
const repository=required("ARCA_GITHUB_REPOSITORY");
const ref=required("ARCA_WORK_WAKE_REF");
const pullRequestNumber=Number(required("ARCA_WORK_WAKE_PR"));
const endpointId=String(process.env.ARCA_WORK_ENDPOINT_ID??"chatgpt-work").trim();
const now=new Date().toISOString();

const endpoint=createChatGPTWorkGitHubTriggerEndpoint({
  endpointId,
  capabilities:["reasoning"],
  repository,
  ref,
  pullRequestNumber,
  token
});

const registry=new ExecutionEndpointRegistry();
registry.register(endpoint.descriptor,endpoint.adapter);

const heartbeat=await probeVinceV5Heartbeat({
  registry,
  endpointId,
  now,
  observationTtlMs:60_000
});

const route=selectVinceV5Route({
  registry,
  capability:"reasoning",
  observations:[heartbeat],
  now
});

const proof=Object.freeze({
  format:"arca-vince-v5-work-readonly-probe-v1",
  version:1,
  observedAt:now,
  target:{
    endpointId,
    repository,
    ref,
    pullRequestNumber
  },
  heartbeat,
  route,
  safety:{
    wakePerformed:false,
    ackQueried:false,
    dispatchPerformed:false,
    repositoryMutation:false,
    termuxExecuted:false,
    edgeStewardActivated:false,
    authorityExpanded:false
  }
});

if(process.argv.includes("--expect-surface-only")){
  if(
    heartbeat.state!=="INCONCLUSIVE"||
    heartbeat.reason!=="SURFACE_REACHABLE_EXECUTION_UNPROVEN"||
    heartbeat.surfaceReachable!==true||
    heartbeat.routeEligible!==false||
    route.state!=="INCONCLUSIVE"||
    route.selectedEndpointId!==null||
    route.eligibleCount!==0||
    route.dispatchPerformed!==false
  )throw new Error("ARCA_VINCE_V5_SURFACE_ONLY_EXPECTATION_FAILED");
}

process.stdout.write(JSON.stringify(proof)+"\n");
