import test from "node:test";
import assert from "node:assert/strict";
import {ActionRegistry} from "../src/machine-bridge/action-registry.mjs";

const worker={workerId:"worker-a",capabilities:["repository"]};
const job=authorization=>({
  format:"arca-remote-job-v3",
  protocolVersion:3,
  jobId:"job-code-1",
  requestId:"req-code-1",
  action:"repository.apply-patch",
  requires:["repository"],
  params:{},
  creatorAuthorization:authorization
});

test("code mutation action fails closed when no Creator verifier exists",async()=>{
  let calls=0;
  const registry=new ActionRegistry().register("repository.apply-patch",{
    requires:["repository"],
    mutationClass:"code",
    handler:async()=>{calls++;return "changed"}
  });
  await assert.rejects(
    ()=>registry.run(job(null),{worker}),
    error=>error?.code==="ARCA_CREATOR_CODE_AUTHORIZATION_REQUIRED"
  );
  assert.equal(calls,0);
});

test("code mutation action rejects non-Creator or non-single-use verdicts",async()=>{
  let calls=0;
  const registry=new ActionRegistry({
    creatorAuthorizationVerifier:async()=>({
      authorized:true,
      creatorVerified:false,
      singleUse:true,
      authorizationId:"auth-1"
    })
  }).register("repository.apply-patch",{
    mutationClass:"code",
    handler:async()=>{calls++;return "changed"}
  });
  await assert.rejects(
    ()=>registry.run(job({requestId:"fake"}),{worker}),
    error=>error?.code==="ARCA_CREATOR_CODE_AUTHORIZATION_REJECTED"
  );
  assert.equal(calls,0);
});

test("code mutation action runs only after verified single-use Creator authorization",async()=>{
  let calls=0;
  let seen=null;
  const registry=new ActionRegistry({
    creatorAuthorizationVerifier:async input=>{
      seen=input;
      return {
        authorized:true,
        creatorVerified:true,
        singleUse:true,
        authorizationId:"creator-auth-001"
      };
    }
  }).register("repository.apply-patch",{
    mutationClass:"code",
    handler:async()=>{calls++;return "changed"}
  });
  const authorization={format:"arca-creator-code-authorization-v1",authorizationId:"creator-auth-001"};
  const result=await registry.run(job(authorization),{worker});
  assert.equal(result,"changed");
  assert.equal(calls,1);
  assert.equal(seen.action,"repository.apply-patch");
  assert.equal(seen.authorization,authorization);
});

test("ordinary read/check actions remain independent from Creator code authorization",async()=>{
  let calls=0;
  const registry=new ActionRegistry().register("repository.inspect",{
    mutationClass:"none",
    handler:async()=>{calls++;return "ok"}
  });
  assert.equal(await registry.run({...job(null),action:"repository.inspect"},{worker}),"ok");
  assert.equal(calls,1);
});

test("invalid mutation classes are rejected at registration",()=>{
  assert.throws(
    ()=>new ActionRegistry().register("repository.unknown",{mutationClass:"maybe",handler:async()=>null}),
    /invalid mutation class/
  );
});
