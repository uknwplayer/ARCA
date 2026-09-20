import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,randomBytes,sign} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createCreatorConsoleServer} from "../packages/workbench/src/creator-server.ts";
import {
  CapabilityRegistry,
  CreatorWorkflowProposalService,
  CreatorWorkflowReasoningService,
  DurableReasoningPendingCoordinator,
  GuardedAutonomyWorkflowCoordinator,
  HumanReviewQueue,
  ReviewAutonomyRuntime,
  ReviewContinuationStore,
  ReviewGatedContinuation
} from "../packages/agent/src/index.ts";

function b64(value){return Buffer.from(value).toString("base64url")}
function unb64(value){return Buffer.from(value,"base64url")}
function sha(value){return createHash("sha256").update(value).digest()}
function cborHead(major,length){if(length<24)return Buffer.from([(major<<5)|length]);if(length<=0xff)return Buffer.from([(major<<5)|24,length]);if(length<=0xffff){const out=Buffer.alloc(3);out[0]=(major<<5)|25;out.writeUInt16BE(length,1);return out}const out=Buffer.alloc(5);out[0]=(major<<5)|26;out.writeUInt32BE(length,1);return out}
function cbor(value){if(Buffer.isBuffer(value))return Buffer.concat([cborHead(2,value.length),value]);if(typeof value==="string"){const raw=Buffer.from(value);return Buffer.concat([cborHead(3,raw.length),raw])}if(Number.isInteger(value)){if(value>=0)return cborHead(0,value);return cborHead(1,-1-value)}if(value instanceof Map){const chunks=[cborHead(5,value.size)];for(const [key,item] of value)chunks.push(cbor(key),cbor(item));return Buffer.concat(chunks)}throw new Error(`unsupported cbor value ${typeof value}`)}
function counter(value){const out=Buffer.alloc(4);out.writeUInt32BE(value);return out}
function registrationFixture({challenge,origin,rpId="localhost"}){const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"P-256"});const jwk=publicKey.export({format:"jwk"});const credentialId=randomBytes(32);const credentialLength=Buffer.alloc(2);credentialLength.writeUInt16BE(credentialId.length);const cose=new Map([[1,2],[3,-7],[-1,1],[-2,unb64(jwk.x)],[-3,unb64(jwk.y)]]);const authData=Buffer.concat([sha(rpId),Buffer.from([0x45]),counter(0),Buffer.alloc(16),credentialLength,credentialId,cbor(cose)]);const attestation=cbor(new Map([["fmt","none"],["attStmt",new Map()],["authData",authData]]));const clientData=Buffer.from(JSON.stringify({type:"webauthn.create",challenge,origin,crossOrigin:false}));return {credentialId:b64(credentialId),privateKey,credential:{id:b64(credentialId),type:"public-key",response:{clientDataJSON:b64(clientData),attestationObject:b64(attestation)}}}}
function assertionFixture({challenge,origin,credentialId,privateKey,signCount}){const clientData=Buffer.from(JSON.stringify({type:"webauthn.get",challenge,origin,crossOrigin:false}));const authData=Buffer.concat([sha("localhost"),Buffer.from([0x05]),counter(signCount)]);const signature=sign("sha256",Buffer.concat([authData,sha(clientData)]),privateKey);return {id:credentialId,type:"public-key",response:{clientDataJSON:b64(clientData),authenticatorData:b64(authData),signature:b64(signature),userHandle:null}}}
async function jsonFetch(url,{method="GET",body,token,headers={}}={}){const response=await fetch(url,{method,headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),...(token?{"X-ARCA-Creator-Session":token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const payload=await response.json();return {response,payload}}
async function start(t,{host="localhost"}={}){const home=await mkdtemp(join(tmpdir(),"arca-passkey-console-"));const instance=createCreatorConsoleServer({home,host,port:0,bootstrapTtlMs:60_000,sessionTtlMs:120_000,passkeyChallengeTtlMs:60_000});const address=await instance.start();t.after(async()=>{await instance.stop();await rm(home,{recursive:true,force:true})});return {home,instance,address}}
async function unlock(address,code){return jsonFetch(`${address.passkeyUrl}/api/unlock`,{method:"POST",body:{code},headers:{"X-ARCA-Creator-Unlock":"1"}})}
const passkeyHeaders={"X-ARCA-Creator-Passkey":"1"};
const enrollHeaders={...passkeyHeaders,"X-ARCA-Creator-Passkey-Enroll":"first"};

class WorkflowClientFixture{
  constructor(){this.submitCalls=[];this.transport={getResult:async()=>null}}
  async submit(job){this.submitCalls.push(structuredClone(job));return {jobId:job.jobId,requestId:job.requestId}}
  async waitForResult(job){return {format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"completed",output:{ok:true}}}
}
function verifiedWorkflowRegistry(){
  const registry=new CapabilityRegistry();const at="2026-09-18T01:10:00.000Z";
  registry.registerParticipant({participantId:"worker.repo",kind:"worker",provider:"arca",capabilities:["node","repository"]},{updatedAt:at});
  registry.recordVerification({participantId:"worker.repo",capabilityId:"node",passed:true,testedAt:at});
  registry.recordVerification({participantId:"worker.repo",capabilityId:"repository",passed:true,testedAt:at});
  return registry
}
function workflowReasoningCoordinator(home){
  const coordinator=Object.create(DurableReasoningPendingCoordinator.prototype);coordinator.providerId="reasoner.console.fixture";coordinator.captured=[];
  coordinator.providerRegistry={getDescriptor(id){return id==="reasoner.console.fixture"?{providerId:id,provider:"fixture",model:"fixture-v1",external:true,transportId:"mesh.fixture",transportKind:"opaque-relay",descriptorHash:"1".repeat(64)}:null}};
  coordinator.store={home,list:async()=>[]};
  coordinator.start=async input=>{coordinator.captured.push(structuredClone(input));return {format:"arca-durable-reasoning-pending-status-v1",version:"1.0.0",state:"awaiting-reasoning",requestId:input.requestId,payloadId:input.payloadId,providerId:coordinator.providerId,readySequence:0,readyPending:false,terminalResultHash:null,finalResultHash:null,executionEvidenceHash:null}};
  coordinator.poll=async requestId=>{const input=coordinator.captured.find(item=>item.requestId===requestId);if(!input)throw new Error("missing reasoning input");return {state:"awaiting-reasoning",requestId,payloadId:input.payloadId,providerId:coordinator.providerId,readySequence:0,readyPending:false}};
  coordinator.status=record=>({format:"arca-durable-reasoning-pending-status-v1",version:"1.0.0",state:record.state,requestId:record.requestId,payloadId:record.payloadId,providerId:coordinator.providerId,readySequence:record.readySequence??0,readyPending:record.readyPending??false,terminalResultHash:null,finalResultHash:null,executionEvidenceHash:null});
  return coordinator
}
async function strongLogin(address,bootstrapToken){
  const registerOptions=await jsonFetch(`${address.passkeyUrl}/api/passkeys/register/options`,{method:"POST",token:bootstrapToken,headers:enrollHeaders,body:{confirmFirstEnrollment:true}});
  const fixture=registrationFixture({challenge:registerOptions.payload.publicKey.challenge,origin:address.passkeyUrl});
  await jsonFetch(`${address.passkeyUrl}/api/passkeys/register/verify`,{method:"POST",token:bootstrapToken,headers:enrollHeaders,body:{challengeId:registerOptions.payload.challengeId,credential:fixture.credential,confirmFirstEnrollment:true}});
  const authOptions=await jsonFetch(`${address.passkeyUrl}/api/passkeys/auth/options`,{method:"POST",headers:passkeyHeaders,body:{}});
  const assertion=assertionFixture({challenge:authOptions.payload.publicKey.challenge,origin:address.passkeyUrl,credentialId:fixture.credentialId,privateKey:fixture.privateKey,signCount:1});
  return jsonFetch(`${address.passkeyUrl}/api/passkeys/auth/verify`,{method:"POST",headers:passkeyHeaders,body:{challengeId:authOptions.payload.challengeId,credential:assertion}})
}

test("first passkey enrollment is localhost-only, explicit and leaves bootstrap session low privilege",async(t)=>{
  const {instance,address}=await start(t);const grant=await unlock(address,address.bootstrap.code);assert.equal(grant.response.status,200);const token=grant.payload.token;
  const missingConfirm=await jsonFetch(`${address.passkeyUrl}/api/passkeys/register/options`,{method:"POST",token,headers:enrollHeaders,body:{confirmFirstEnrollment:false}});assert.equal(missingConfirm.response.status,400);assert.equal(missingConfirm.payload.error.code,"FIRST_PASSKEY_CONFIRMATION_REQUIRED");
  const options=await jsonFetch(`${address.passkeyUrl}/api/passkeys/register/options`,{method:"POST",token,headers:enrollHeaders,body:{confirmFirstEnrollment:true}});assert.equal(options.response.status,200);assert.equal(options.payload.publicKey.rp.id,"localhost");const fixture=registrationFixture({challenge:options.payload.publicKey.challenge,origin:address.passkeyUrl});
  const verified=await jsonFetch(`${address.passkeyUrl}/api/passkeys/register/verify`,{method:"POST",token,headers:enrollHeaders,body:{challengeId:options.payload.challengeId,credential:fixture.credential,confirmFirstEnrollment:true,label:"celular principal"}});assert.equal(verified.response.status,201);assert.equal(verified.payload.credential.label,"celular principal");
  const state=await jsonFetch(`${address.passkeyUrl}/api/state`,{token});assert.equal(state.payload.security.strongSession,false);assert.equal(state.payload.security.sessionAuthMethod,"local-bootstrap");assert.equal(state.payload.security.passkeys.active,1);assert.equal(state.payload.security.passkeys.canEnrollFirst,false);
  const nextBootstrap=instance.rotateBootstrap();const second=await unlock(address,nextBootstrap.code);const denied=await jsonFetch(`${address.passkeyUrl}/api/passkeys/register/options`,{method:"POST",token:second.payload.token,headers:enrollHeaders,body:{confirmFirstEnrollment:true}});assert.equal(denied.response.status,409);assert.equal(denied.payload.error.code,"PASSKEY_ALREADY_ENROLLED");
});

test("passkey login creates strong Creator session and credential-bound step-up",async(t)=>{
  const {address}=await start(t);const bootstrap=await unlock(address,address.bootstrap.code);const registerOptions=await jsonFetch(`${address.passkeyUrl}/api/passkeys/register/options`,{method:"POST",token:bootstrap.payload.token,headers:enrollHeaders,body:{confirmFirstEnrollment:true}});const fixture=registrationFixture({challenge:registerOptions.payload.publicKey.challenge,origin:address.passkeyUrl});await jsonFetch(`${address.passkeyUrl}/api/passkeys/register/verify`,{method:"POST",token:bootstrap.payload.token,headers:enrollHeaders,body:{challengeId:registerOptions.payload.challengeId,credential:fixture.credential,confirmFirstEnrollment:true}});
  const authOptions=await jsonFetch(`${address.passkeyUrl}/api/passkeys/auth/options`,{method:"POST",headers:passkeyHeaders,body:{}});assert.equal(authOptions.response.status,200);const assertion=assertionFixture({challenge:authOptions.payload.publicKey.challenge,origin:address.passkeyUrl,credentialId:fixture.credentialId,privateKey:fixture.privateKey,signCount:1});const auth=await jsonFetch(`${address.passkeyUrl}/api/passkeys/auth/verify`,{method:"POST",headers:passkeyHeaders,body:{challengeId:authOptions.payload.challengeId,credential:assertion}});assert.equal(auth.response.status,200);assert.equal(auth.payload.session.authMethod,"webauthn");assert.equal(auth.payload.session.strong,true);assert.ok(auth.payload.session.scopes.includes("creator.review"));assert.equal(auth.payload.session.stepUpAt,null);
  const state=await jsonFetch(`${address.passkeyUrl}/api/state`,{token:auth.payload.token});assert.equal(state.payload.security.strongSession,true);
  const stepOptions=await jsonFetch(`${address.passkeyUrl}/api/passkeys/step-up/options`,{method:"POST",token:auth.payload.token,headers:passkeyHeaders,body:{}});const stepAssertion=assertionFixture({challenge:stepOptions.payload.publicKey.challenge,origin:address.passkeyUrl,credentialId:fixture.credentialId,privateKey:fixture.privateKey,signCount:2});const stepped=await jsonFetch(`${address.passkeyUrl}/api/passkeys/step-up/verify`,{method:"POST",token:auth.payload.token,headers:passkeyHeaders,body:{challengeId:stepOptions.payload.challengeId,credential:stepAssertion}});assert.equal(stepped.response.status,200);assert.ok(stepped.payload.session.stepUpAt);
});

test("passkey auth is unavailable before enrollment and ceremonies refuse non-localhost Host",async(t)=>{
  const {address}=await start(t);const none=await jsonFetch(`${address.passkeyUrl}/api/passkeys/auth/options`,{method:"POST",headers:passkeyHeaders,body:{}});assert.equal(none.response.status,409);assert.equal(none.payload.error.code,"PASSKEY_NOT_ENROLLED");
  if(new URL(address.url).hostname!=="localhost"){const rejected=await jsonFetch(`${address.url}/api/passkeys/auth/options`,{method:"POST",headers:passkeyHeaders,body:{}});assert.equal(rejected.response.status,409);assert.equal(rejected.payload.error.code,"PASSKEY_LOCALHOST_REQUIRED")}
});

test("Creator browser shell exposes passkey controls without remote bind",async(t)=>{
  const {address}=await start(t);const response=await fetch(`${address.passkeyUrl}/`);const html=await response.text();assert.equal(response.status,200);assert.match(html,/Entrar com passkey/);assert.match(html,/Cadastrar passkey/);assert.match(response.headers.get("permissions-policy"),/publickey-credentials-get/);
});


test("strong Creator session can read and decide Human Review while bootstrap is denied",async(t)=>{
  const {instance,address}=await start(t);
  const review=await instance.reviews.submit({
    kind:"reasoning.output",
    title:"Reasoning output requires review",
    summary:"Synthetic private reasoning review.",
    priority:"high",
    source:{system:"reasoning",requestId:"req-review-console",findingId:"reasoning-output"},
    payload:{output:{analysis:"review fixture"},privacyClassification:{privacyClass:"restricted"}},
    idempotencyKey:"review-console-fixture"
  });
  const bootstrap=await unlock(address,address.bootstrap.code);
  const bootstrapList=await jsonFetch(`${address.passkeyUrl}/api/reviews?status=pending`,{token:bootstrap.payload.token});
  assert.equal(bootstrapList.response.status,403);
  assert.equal(bootstrapList.payload.error.code,"CREATOR_COMMAND_DENIED");

  const registerOptions=await jsonFetch(`${address.passkeyUrl}/api/passkeys/register/options`,{method:"POST",token:bootstrap.payload.token,headers:enrollHeaders,body:{confirmFirstEnrollment:true}});
  const fixture=registrationFixture({challenge:registerOptions.payload.publicKey.challenge,origin:address.passkeyUrl});
  await jsonFetch(`${address.passkeyUrl}/api/passkeys/register/verify`,{method:"POST",token:bootstrap.payload.token,headers:enrollHeaders,body:{challengeId:registerOptions.payload.challengeId,credential:fixture.credential,confirmFirstEnrollment:true}});

  const authOptions=await jsonFetch(`${address.passkeyUrl}/api/passkeys/auth/options`,{method:"POST",headers:passkeyHeaders,body:{}});
  const assertion=assertionFixture({challenge:authOptions.payload.publicKey.challenge,origin:address.passkeyUrl,credentialId:fixture.credentialId,privateKey:fixture.privateKey,signCount:1});
  const auth=await jsonFetch(`${address.passkeyUrl}/api/passkeys/auth/verify`,{method:"POST",headers:passkeyHeaders,body:{challengeId:authOptions.payload.challengeId,credential:assertion}});
  const token=auth.payload.token;

  const list=await jsonFetch(`${address.passkeyUrl}/api/reviews?status=pending`,{token});
  assert.equal(list.response.status,200);
  assert.equal(list.payload.items.length,1);
  assert.equal(list.payload.items[0].reviewId,review.reviewId);
  assert.equal(list.payload.items[0].payload.output.analysis,"review fixture");

  const decided=await jsonFetch(`${address.passkeyUrl}/api/reviews/resolve`,{
    method:"POST",token,
    body:{reviewId:review.reviewId,decision:"approve",reason:"approved in Creator Console test",expectedRecordHash:review.recordHash}
  });
  assert.equal(decided.response.status,200);
  assert.equal(decided.payload.review.resolution.decision,"approve");
  assert.equal(decided.payload.gate.state,"authorized-to-continue");
  assert.equal(decided.payload.gate.authorizedToContinue,true);
  assert.equal(decided.payload.continuationPointer.wake.pending,true);

  const pending=await jsonFetch(`${address.passkeyUrl}/api/reviews?status=pending`,{token});
  assert.equal(pending.payload.items.length,0);
});


test("structured workflow API is strong-session only and registration stays inert until a later approved wake",async(t)=>{
  const home=await mkdtemp(join(tmpdir(),"arca-workflow-console-"));
  const queue=new HumanReviewQueue(home);
  const pointerStore=new ReviewContinuationStore(home);
  const gate=new ReviewGatedContinuation(queue,{continuationStore:pointerStore});
  const client=new WorkflowClientFixture();
  const workflow=new GuardedAutonomyWorkflowCoordinator({home,gate,client,waitTimeoutMs:2000,pollIntervalMs:100});
  const runtime=new ReviewAutonomyRuntime(queue,[workflow.handler],{pointerStore,consumerId:"runtime:creator-console-workflow"});
  const service=new CreatorWorkflowProposalService({home,registry:verifiedWorkflowRegistry(),workflow,reviewRuntime:runtime});
  const instance=createCreatorConsoleServer({home,host:"localhost",port:0,workflowProposalService:service,bootstrapTtlMs:60_000,sessionTtlMs:120_000,passkeyChallengeTtlMs:60_000});
  const address=await instance.start();
  t.after(async()=>{await runtime.stop().catch(()=>{});await instance.stop();await rm(home,{recursive:true,force:true})});

  const bootstrap=await unlock(address,address.bootstrap.code);
  const bootstrapAttempt=await jsonFetch(`${address.passkeyUrl}/api/workflows/propose`,{
    method:"POST",token:bootstrap.payload.token,
    body:{requestId:"req-console-structured",steps:[{stepId:"check",capabilityId:"repository",params:{}}]}
  });
  assert.equal(bootstrapAttempt.response.status,403);
  assert.equal(bootstrapAttempt.payload.error.code,"CREATOR_COMMAND_DENIED");

  const auth=await strongLogin(address,bootstrap.payload.token);
  assert.equal(auth.response.status,200);const token=auth.payload.token;

  const state=await jsonFetch(`${address.passkeyUrl}/api/state`,{token});
  assert.equal(state.payload.workflows.structuredProposal,true);

  const capabilities=await jsonFetch(`${address.passkeyUrl}/api/workflows/capabilities`,{token});
  assert.equal(capabilities.response.status,200);
  assert.equal(capabilities.payload.policies[0].capabilityId,"pncp-plan");
  assert.ok(capabilities.payload.policies.some(item=>item.capabilityId==="repository"));

  const proposed=await jsonFetch(`${address.passkeyUrl}/api/workflows/propose`,{
    method:"POST",token,
    body:{
      requestId:"req-console-structured",
      objectiveId:"repository-validation",
      steps:[{stepId:"check",capabilityId:"repository",params:{}}],
      executionPolicy:{maxSubmitAttemptsPerJob:2,maxTotalSubmitAttempts:4}
    }
  });
  assert.equal(proposed.response.status,201);
  assert.equal(proposed.payload.proposal.status,"ready");
  assert.equal(proposed.payload.proposal.plan.steps[0].recipeId,"mb.repository.check");

  const item=proposed.payload.proposal;
  const registered=await jsonFetch(`${address.passkeyUrl}/api/workflows/register`,{
    method:"POST",token,
    body:{proposalId:item.proposalId,expectedRecordHash:item.recordHash,expectedPlanHash:item.plan.planHash,confirmRegistration:true}
  });
  assert.equal(registered.response.status,200);
  assert.equal(registered.payload.proposal.status,"registered");
  assert.equal(registered.payload.proposal.registration.executionPerformed,false);
  assert.equal(client.submitCalls.length,0);

  const listed=await jsonFetch(`${address.passkeyUrl}/api/workflows/proposals?status=registered`,{token});
  assert.equal(listed.response.status,200);
  assert.equal(listed.payload.items.length,1);
  assert.equal(listed.payload.items[0].proposalId,item.proposalId);
});


test("Creator Console workflow reasoning endpoint is strong-session only and exposes pending binding metadata",async(t)=>{
  const home=await mkdtemp(join(tmpdir(),"arca-workflow-reasoning-console-"));
  const queue=new HumanReviewQueue(home);const pointerStore=new ReviewContinuationStore(home);const gate=new ReviewGatedContinuation(queue,{continuationStore:pointerStore});
  const client=new WorkflowClientFixture();const workflow=new GuardedAutonomyWorkflowCoordinator({home,gate,client,waitTimeoutMs:2000,pollIntervalMs:100});
  const runtime=new ReviewAutonomyRuntime(queue,[workflow.handler],{pointerStore,consumerId:"runtime:workflow-reasoning-console"});
  const proposals=new CreatorWorkflowProposalService({home,registry:verifiedWorkflowRegistry(),workflow,reviewRuntime:runtime});
  const proposalDraft=await proposals.propose({requestId:"req-workflow-reasoning-console",steps:[{stepId:"check",capabilityId:"repository"}]});
  const proposal=await proposals.register({proposalId:proposalDraft.proposalId,expectedRecordHash:proposalDraft.recordHash,expectedPlanHash:proposalDraft.plan.planHash,confirmRegistration:true});
  const reasoning=new CreatorWorkflowReasoningService({coordinator:workflowReasoningCoordinator(home),proposals});
  const instance=createCreatorConsoleServer({home,host:"localhost",port:0,workflowProposalService:proposals,workflowReasoningService:reasoning,bootstrapTtlMs:60_000,sessionTtlMs:120_000,passkeyChallengeTtlMs:60_000});
  const address=await instance.start();t.after(async()=>{await runtime.stop().catch(()=>{});await instance.stop();await rm(home,{recursive:true,force:true})});

  const bootstrap=await unlock(address,address.bootstrap.code);
  const denied=await jsonFetch(`${address.passkeyUrl}/api/workflows/reason`,{method:"POST",token:bootstrap.payload.token,body:{proposalId:proposal.proposalId,expectedRecordHash:proposal.recordHash,expectedPlanHash:proposal.plan.planHash,message:"private analysis"}});
  assert.equal(denied.response.status,403);assert.equal(denied.payload.error.code,"CREATOR_COMMAND_DENIED");

  const auth=await strongLogin(address,bootstrap.payload.token);const token=auth.payload.token;
  const state=await jsonFetch(`${address.passkeyUrl}/api/state`,{token});assert.equal(state.payload.workflows.reasoningBinding,true);
  const started=await jsonFetch(`${address.passkeyUrl}/api/workflows/reason`,{method:"POST",token,body:{proposalId:proposal.proposalId,expectedRecordHash:proposal.recordHash,expectedPlanHash:proposal.plan.planHash,message:"private analysis"}});
  assert.equal(started.response.status,200);assert.equal(started.payload.reasoningState,"awaiting-reasoning");assert.equal(started.payload.output.binding.proposalId,proposal.proposalId);

  const status=await jsonFetch(`${address.passkeyUrl}/api/workflows/reason/status?requestId=${encodeURIComponent(proposal.requestId)}`,{token});
  assert.equal(status.response.status,200);assert.equal(status.payload.reasoningState,"awaiting-reasoning");
  const pending=await jsonFetch(`${address.passkeyUrl}/api/workflows/reason/pending`,{token});
  assert.equal(pending.response.status,200);assert.equal(pending.payload.output.items.length,1);assert.equal(pending.payload.output.items[0].binding.planHash,proposal.plan.planHash);
  assert.equal(client.submitCalls.length,0);
});
