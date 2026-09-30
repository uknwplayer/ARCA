#!/usr/bin/env node
import {ExecutionEndpointRegistry} from "../src/machine-bridge/execution-endpoint.mjs";
import {createChatGPTWorkGitHubTriggerEndpoint} from "../src/machine-bridge/work-github-trigger-endpoint.mjs";
import {
  observeVinceV5Ack,
  selectVinceV5Route
} from "../src/machine-bridge/vince-v5-endpoint-availability.mjs";

function required(name){
  const value=String(process.env[name]??"").trim();
  if(!value)throw new Error(`missing required environment: ${name}`);
  return value;
}
function positiveInteger(value,fallback){
  if(value===undefined||value===null||String(value).trim()==="")return fallback;
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1)throw new Error("invalid positive integer environment value");
  return n;
}

const token=required("ARCA_GITHUB_TOKEN");
const repository=required("ARCA_GITHUB_REPOSITORY");
const ref=required("ARCA_WORK_WAKE_REF");
const pullRequestNumber=Number(required("ARCA_WORK_WAKE_PR"));
const wakeId=required("ARCA_WORK_WAKE_ID").toLowerCase();
const commitSha=required("ARCA_WORK_WAKE_COMMIT_SHA").toLowerCase();
const endpointId=String(process.env.ARCA_WORK_ENDPOINT_ID??"chatgpt-work").trim();
const maxAckAgeMs=positiveInteger(process.env.ARCA_WORK_MAX_ACK_AGE_MS,300_000);
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

const ack=await observeVinceV5Ack({
  registry,
  endpointId,
  ackInput:{wakeId,commitSha},
  now,
  maxAckAgeMs
});

const route=selectVinceV5Route({
  registry,
  capability:"reasoning",
  observations:[ack],
  now
});

const proof=Object.freeze({
  format:"arca-vince-v5-work-ack-observation-v1",
  version:1,
  observedAt:now,
  target:{
    endpointId,
    repository,
    ref,
    pullRequestNumber,
    wakeId,
    commitSha
  },
  maxAckAgeMs,
  ack,
  route,
  safety:{
    wakePerformed:false,
    ackQueried:true,
    dispatchPerformed:false,
    repositoryMutation:false,
    termuxExecuted:false,
    edgeStewardActivated:false,
    authorityExpanded:false
  }
});

if(process.argv.includes("--expect-ack")){
  if(
    ack.state!=="AVAILABLE"||
    ack.reason!=="RECENT_CORRELATED_ACK"||
    ack.wakeAcknowledged!==true||
    ack.routeEligible!==true||
    route.state!=="AVAILABLE"||
    route.selectedEndpointId!==endpointId||
    route.eligibleCount!==1||
    route.dispatchPerformed!==false
  )throw new Error("ARCA_VINCE_V5_CORRELATED_ACK_EXPECTATION_FAILED");
}

if(process.argv.includes("--expect-no-ack")){
  if(
    ack.state!=="INCONCLUSIVE"||
    ack.routeEligible!==false||
    route.state!=="INCONCLUSIVE"||
    route.selectedEndpointId!==null||
    route.eligibleCount!==0||
    route.dispatchPerformed!==false
  )throw new Error("ARCA_VINCE_V5_NO_ACK_EXPECTATION_FAILED");
}

process.stdout.write(JSON.stringify(proof)+"\n");
