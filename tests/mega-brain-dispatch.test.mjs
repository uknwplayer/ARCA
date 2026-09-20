import test from "node:test";
import assert from "node:assert/strict";
import {ActionRegistry} from "../src/machine-bridge/action-registry.mjs";
import {
  MEGA_BRAIN_DISPATCH_ACTION,
  MEGA_BRAIN_TASK_CAPABILITY,
  normalizeMegaBrainDispatchResult,
  normalizeMegaBrainTask,
  registerMegaBrainDispatchAction
} from "../src/machine-bridge/mega-brain-dispatch.mjs";

const task={
  format:"arca-mega-brain-task-v1",
  version:1,
  missionId:"M-REMOTE-1",
  taskId:"T-REMOTE-1",
  objective:"Research a bounded question",
  requiredCapabilities:["research"],
  dependencies:[],
  assignedNodeId:"node.remote",
  createdFromResultId:null
};

function output(overrides={}){
  return {
    format:"arca-mega-brain-dispatch-result-v1",
    version:1,
    resultId:"R-REMOTE-1",
    missionId:task.missionId,
    taskId:task.taskId,
    nodeId:task.assignedNodeId,
    claims:[{claimId:"C-REMOTE-1",text:"Remote claim"}],
    evidence:[{
      evidenceId:"E-REMOTE-1",
      sourceRef:"source://remote/1",
      contentDigest:"sha256:abc",
      claimIds:["C-REMOTE-1"]
    }],
    uncertainties:["Requires independent review."],
    recommendedFollowups:[{
      objective:"Verify independently",
      requiredCapabilities:["verify"]
    }],
    ...overrides
  };
}

test("task normalization rejects unsupported fields",()=>{
  assert.throws(
    ()=>normalizeMegaBrainTask({...task,command:"rm -rf /"}),
    /unsupported field/
  );
});

test("dispatch action is absent unless explicitly registered",()=>{
  const registry=new ActionRegistry();
  assert.equal(registry.has(MEGA_BRAIN_DISPATCH_ACTION),false);
});

test("registration requires an explicit executor",()=>{
  const registry=new ActionRegistry();
  assert.throws(
    ()=>registerMegaBrainDispatchAction(registry),
    /explicit mega brain executor required/
  );
});

test("closed dispatch action validates task and result",async()=>{
  const registry=new ActionRegistry();
  let seen=null;
  registerMegaBrainDispatchAction(registry,{
    executor:async context=>{
      seen=context;
      return output();
    }
  });

  const job={
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"mbjob-test-1",
    requestId:"mbreq-test-1",
    action:MEGA_BRAIN_DISPATCH_ACTION,
    requires:[MEGA_BRAIN_TASK_CAPABILITY,"research"],
    workerTarget:"any",
    params:{task},
    timeoutMs:5000
  };
  const worker={
    workerId:"worker-remote",
    capabilities:[MEGA_BRAIN_TASK_CAPABILITY,"research"]
  };

  const value=await registry.run(job,{worker});

  assert.equal(seen.task.taskId,"T-REMOTE-1");
  assert.equal(seen.worker.workerId,"worker-remote");
  assert.equal(value.format,"arca-mega-brain-dispatch-result-v1");
  assert.equal(value.nodeId,"node.remote");
  assert.equal(value.claims[0].claimId,"C-REMOTE-1");
  assert.equal(value.recommendedFollowups[0].requiredCapabilities[0],"verify");
});

test("result with wrong logical node fails closed",()=>{
  assert.throws(
    ()=>normalizeMegaBrainDispatchResult(output({nodeId:"node.other"}),{task}),
    /node mismatch/
  );
});

test("result cannot smuggle truth authority field",()=>{
  assert.throws(
    ()=>normalizeMegaBrainDispatchResult({
      ...output(),
      truth:true
    },{task}),
    /unsupported field/
  );
});

test("followups remain structured and cannot inject action names",()=>{
  assert.throws(
    ()=>normalizeMegaBrainDispatchResult(output({
      recommendedFollowups:[{
        objective:"Verify independently",
        requiredCapabilities:["verify"],
        action:"repository.check"
      }]
    }),{task}),
    /unsupported field/
  );
});
