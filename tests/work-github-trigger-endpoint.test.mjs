import test from "node:test";
import assert from "node:assert/strict";
import {ExecutionEndpointRegistry} from "../src/machine-bridge/execution-endpoint.mjs";
import {createChatGPTWorkGitHubTriggerEndpoint} from "../src/machine-bridge/work-github-trigger-endpoint.mjs";

const wakeId="a".repeat(64), taskHash="b".repeat(64), commitSha="c".repeat(40);
function jsonResponse(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}})}
function pr(){return {state:"open",head:{ref:"test/work-wake",sha:"d".repeat(40),repo:{full_name:"example/arca"}},base:{ref:"main"}}}

test("Work GitHub trigger endpoint refuses canonical branches and unsafe stimulus paths",()=>{
  assert.throws(()=>createChatGPTWorkGitHubTriggerEndpoint({repository:"example/arca",ref:"main",pullRequestNumber:7,token:"x"}),/CANONICAL_REF_FORBIDDEN/);
  assert.throws(()=>createChatGPTWorkGitHubTriggerEndpoint({repository:"example/arca",ref:"test/work-wake",pullRequestNumber:7,stimulusPath:"src/wake.mjs",token:"x"}),/PATH_INVALID/);
});

test("wake creates one PR commit stimulus without repository_dispatch or task payload",async()=>{
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url,options});
    if(url.endsWith("/pulls/7"))return jsonResponse(pr());
    if(url.includes("/contents/experiments/work-wakeup/PROBE.md?ref="))return jsonResponse({sha:"old-blob",content:Buffer.from("old").toString("base64")});
    if(url.endsWith("/contents/experiments/work-wakeup/PROBE.md")&&options.method==="PUT")return jsonResponse({commit:{sha:commitSha}});
    throw new Error("unexpected "+url);
  };
  const endpoint=createChatGPTWorkGitHubTriggerEndpoint({endpointId:"chatgpt-work",capabilities:["reasoning"],repository:"example/arca",ref:"test/work-wake",pullRequestNumber:7,token:"TOKEN",fetchImpl});
  const registry=new ExecutionEndpointRegistry();registry.register(endpoint.descriptor,endpoint.adapter);
  const result=await registry.wake("chatgpt-work",{requestId:"req-1",taskRef:"machine-bridge:job-1",taskHash,createdAt:"2026-09-20T11:00:00Z"});
  assert.equal(result.receipt.commitSha,commitSha);
  assert.equal(result.receipt.githubActionsUsed,false);
  assert.equal(result.receipt.externalExecutionObserved,false);
  assert.equal(calls.some(call=>call.url.includes("dispatches")),false);
  const put=calls.find(call=>call.options.method==="PUT");
  const request=JSON.parse(put.options.body);
  const rendered=Buffer.from(request.content,"base64").toString("utf8");
  assert.match(rendered,/ARCA-WAKE-[A-F0-9]{32}/);
  assert.match(rendered,/requestId: `req-1`/);
  assert.match(rendered,/taskRef: `machine-bridge:job-1`/);
  assert.match(rendered,/carries no task payload/);
  assert.equal(rendered.includes("TOKEN"),false);
  assert.equal(request.branch,"test/work-wake");
  assert.equal(request.sha,"old-blob");
});

test("heartbeat proves trigger surface configuration but not Work execution",async()=>{
  const endpoint=createChatGPTWorkGitHubTriggerEndpoint({repository:"example/arca",ref:"test/work-wake",pullRequestNumber:7,token:"x",fetchImpl:async url=>url.endsWith("/pulls/7")?jsonResponse(pr()):jsonResponse({},404)});
  const registry=new ExecutionEndpointRegistry();registry.register(endpoint.descriptor,endpoint.adapter);
  const hb=await registry.heartbeat("chatgpt-work");
  assert.equal(hb.receipt.available,true);
  assert.equal(hb.receipt.workExecutionObserved,false);
});

test("ack observes the proven Work comment correlated to wake and commit",async()=>{
  const token=`ARCA-WAKE-${wakeId.slice(0,32).toUpperCase()}`;
  const fetchImpl=async url=>{
    if(url.endsWith("/pulls/7"))return jsonResponse(pr());
    if(url.includes("/issues/7/comments"))return jsonResponse([{id:99,html_url:"https://github.test/comment/99",created_at:"2026-09-20T10:47:58Z",body:`WORK-WAKEUP-ACK\n\nProbe token: \`${token}\`\n\nObserved head commit SHA: \`${commitSha}\``}]);
    throw new Error("unexpected "+url);
  };
  const endpoint=createChatGPTWorkGitHubTriggerEndpoint({repository:"example/arca",ref:"test/work-wake",pullRequestNumber:7,token:"x",fetchImpl});
  const registry=new ExecutionEndpointRegistry();registry.register(endpoint.descriptor,endpoint.adapter);
  const ack=await registry.ack("chatgpt-work",{wakeId,commitSha});
  assert.equal(ack.receipt.acknowledged,true);
  assert.equal(ack.receipt.commentId,99);
  assert.equal(ack.receipt.authorityGranted,false);
});

test("ack does not infer execution from an unrelated comment",async()=>{
  const fetchImpl=async url=>url.endsWith("/pulls/7")?jsonResponse(pr()):jsonResponse([{id:1,body:"looks good"}]);
  const endpoint=createChatGPTWorkGitHubTriggerEndpoint({repository:"example/arca",ref:"test/work-wake",pullRequestNumber:7,token:"x",fetchImpl});
  const registry=new ExecutionEndpointRegistry();registry.register(endpoint.descriptor,endpoint.adapter);
  const ack=await registry.ack("chatgpt-work",{wakeId,commitSha});
  assert.equal(ack.receipt.acknowledged,false);
});


test("result observes one signed safe Work completion without turning it into authority",async()=>{
  const resultBody={format:"arca-work-result-v1",jobId:"work-job-2",requestId:"work-req-2",workerId:"work:primary",signatureVerified:true,lifecycle:[{event:"queued"},{event:"claimed"},{event:"running"},{event:"completed"}],status:"completed",output:{echo:"PASS"},safety:{mainMutated:false,merged:false,arbitraryShellExecuted:false}};
  const fetchImpl=async url=>{
    if(url.endsWith("/pulls/7"))return jsonResponse(pr());
    if(url.includes("/issues/7/comments"))return jsonResponse([{id:101,html_url:"https://github.test/comment/101",created_at:"2026-09-20T11:08:35Z",body:"ARCA-WORK-RESULT-V1\n"+JSON.stringify(resultBody)}]);
    throw new Error("unexpected "+url);
  };
  const endpoint=createChatGPTWorkGitHubTriggerEndpoint({repository:"example/arca",ref:"test/work-wake",pullRequestNumber:7,token:"x",fetchImpl});
  const registry=new ExecutionEndpointRegistry();registry.register(endpoint.descriptor,endpoint.adapter);
  const observed=await registry.result("chatgpt-work",{jobId:"work-job-2",requestId:"work-req-2"});
  assert.equal(observed.receipt.found,true);
  assert.equal(observed.receipt.signatureVerified,true);
  assert.equal(observed.receipt.safetyPassed,true);
  assert.equal(observed.receipt.boundedCompletionEvidence,true);
  assert.equal(observed.receipt.trustedCompletion,false);
  assert.equal(observed.receipt.workerIdentityCryptographicallyVerified,false);
  assert.equal(observed.receipt.authorityGranted,false);
  assert.deepEqual(observed.receipt.result.output,{echo:"PASS"});
});

test("result rejects contradictory terminal comments",async()=>{
  const body={format:"arca-work-result-v1",jobId:"work-job-x",requestId:"req-x",signatureVerified:true,status:"completed",safety:{mainMutated:false,merged:false,arbitraryShellExecuted:false}};
  const fetchImpl=async url=>url.endsWith("/pulls/7")?jsonResponse(pr()):jsonResponse([{id:1,body:"ARCA-WORK-RESULT-V1\n"+JSON.stringify(body)},{id:2,body:"ARCA-WORK-RESULT-V1\n"+JSON.stringify({...body,status:"failed"})}]);
  const endpoint=createChatGPTWorkGitHubTriggerEndpoint({repository:"example/arca",ref:"test/work-wake",pullRequestNumber:7,token:"x",fetchImpl});
  const registry=new ExecutionEndpointRegistry();registry.register(endpoint.descriptor,endpoint.adapter);
  await assert.rejects(()=>registry.result("chatgpt-work",{jobId:"work-job-x"}),/CONTRADICTORY_TERMINALS/);
});
