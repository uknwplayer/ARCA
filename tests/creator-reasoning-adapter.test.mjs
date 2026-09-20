import test from "node:test";
import assert from "node:assert/strict";
import {CapabilityRegistry} from "../packages/agent/src/capability-registry.ts";
import {createReasoningTransportProfile} from "../packages/agent/src/reasoning-transport-gate.ts";
import {
  ARCA_REASONING_PROVIDER_RESULT_FORMAT,
  ReasoningProviderRegistry,
  registerReasoningProviderCapability
} from "../packages/agent/src/reasoning-capability.ts";
import {createCreatorChatHandlerFromReasoningProvider} from "../packages/agent/src/creator-reasoning-adapter.ts";

const T1="2026-09-17T23:10:00.000Z";

const bootstrapSession={
  format:"arca-creator-session-v1",
  sessionId:"creator-reasoning-bootstrap",
  subject:"creator:primary",
  scopes:["creator.chat","creator.read"],
  authMethod:"local-bootstrap",
  credentialIdHash:"a".repeat(64),
  issuedAt:"2026-09-17T23:00:00.000Z",
  expiresAt:"2026-09-17T23:30:00.000Z"
};
const strongSession={...bootstrapSession,sessionId:"creator-reasoning-strong",authMethod:"webauthn"};

function localTransport(){
  return createReasoningTransportProfile({
    transportId:"creator.local",
    kind:"local",
    persistence:"ephemeral",
    relayVisibility:"none",
    encryption:"none",
    external:false,
    operator:"arca-local"
  });
}
function directTransport(){
  return createReasoningTransportProfile({
    transportId:"creator.direct",
    kind:"private-direct",
    persistence:"ephemeral",
    relayVisibility:"none",
    encryption:"tls",
    external:true,
    operator:"verified-provider"
  });
}
function repoTransport(){
  return createReasoningTransportProfile({
    transportId:"creator.repo",
    kind:"repository-backed",
    persistence:"durable",
    relayVisibility:"plaintext-storage",
    encryption:"tls",
    external:true,
    operator:"github"
  });
}
function providerResult(request,output){
  return {
    format:ARCA_REASONING_PROVIDER_RESULT_FORMAT,
    requestId:request.requestId,
    payloadId:request.payloadId,
    status:"completed",
    output,
    humanReviewRequired:true,
    coreMutationPerformed:false
  };
}
function verifiedProvider({providerId,transport,send,provider="fixture",model="fixture"}){
  const providers=new ReasoningProviderRegistry();
  const descriptor=providers.register({providerId,provider,model,transport,timeoutMs:5000},send);
  const capabilities=new CapabilityRegistry();
  registerReasoningProviderCapability(capabilities,descriptor,{updatedAt:T1});
  capabilities.recordVerification({
    participantId:providerId,
    capabilityId:"reasoning",
    verifierId:"test-verifier",
    passed:true,
    testedAt:T1,
    evidenceHash:"a".repeat(64),
    notes:"fixture verified"
  });
  return {providers,capabilities,descriptor};
}

test("Creator reasoning adapter uses only a verified local reasoning provider and minimizes context",async()=>{
  let captured;
  const {providers,capabilities}=verifiedProvider({
    providerId:"reasoner.creator.local",
    transport:localTransport(),
    send:async(request,context)=>{
      captured={request,context};
      return providerResult(request,{text:`local:${request.instruction}`});
    }
  });
  const handler=createCreatorChatHandlerFromReasoningProvider(providers,capabilities,{providerId:"reasoner.creator.local"});
  const result=await handler({
    message:"continue o trabalho",
    requestId:"req.creator.reasoning.local",
    session:bootstrapSession,
    context:{home:"/private/arca-home"}
  });

  assert.equal(result.format,"arca-creator-reasoning-adapter-v1");
  assert.equal(result.requestId,"req.creator.reasoning.local");
  assert.equal(result.provider.providerId,"reasoner.creator.local");
  assert.equal(result.provider.external,false);
  assert.equal(result.reasoningCapabilityVerified,true);
  assert.equal(result.privacyClass,"restricted");
  assert.equal(result.humanReviewRequired,true);
  assert.equal(result.coreMutationPerformed,false);
  assert.equal(result.privacyReclassificationRequired,true);
  assert.equal(result.output.text,"local:continue o trabalho");
  assert.equal(captured.request.requestId,"req.creator.reasoning.local");
  assert.equal(captured.request.context.channel,"arca-creator-console");
  assert.equal(JSON.stringify(captured.request).includes("/private/arca-home"),false);
  assert.equal(JSON.stringify(captured.request).includes("creator:primary"),false);
});

test("Creator reasoning adapter refuses unverified reasoning capability before provider send",async()=>{
  let calls=0;
  const providers=new ReasoningProviderRegistry();
  const descriptor=providers.register({
    providerId:"reasoner.creator.unverified",
    provider:"fixture",
    model:"fixture",
    transport:localTransport(),
    timeoutMs:5000
  },async request=>{calls+=1;return providerResult(request,{text:"no"})});
  const capabilities=new CapabilityRegistry();
  registerReasoningProviderCapability(capabilities,descriptor,{updatedAt:T1});
  const handler=createCreatorChatHandlerFromReasoningProvider(providers,capabilities,{providerId:"reasoner.creator.unverified"});
  await assert.rejects(()=>handler({
    message:"status",
    requestId:"req.creator.unverified",
    session:bootstrapSession
  }),/capability reasoning verificada/);
  assert.equal(calls,0);
});

test("external private reasoning requires host opt-in, identity assertion and strong Creator session",async()=>{
  let calls=0;
  const {providers,capabilities}=verifiedProvider({
    providerId:"reasoner.creator.direct",
    transport:directTransport(),
    send:async request=>{calls+=1;return providerResult(request,{text:"remote-private-ok"})}
  });

  const deniedByHost=createCreatorChatHandlerFromReasoningProvider(providers,capabilities,{
    providerId:"reasoner.creator.direct"
  });
  await assert.rejects(()=>deniedByHost({message:"x",requestId:"req.ext.host",session:strongSession}),/externo nao autorizado/);

  const deniedByPrivate=createCreatorChatHandlerFromReasoningProvider(providers,capabilities,{
    providerId:"reasoner.creator.direct",
    allowExternal:true,
    externalProviderIdentityVerified:true
  });
  await assert.rejects(()=>deniedByPrivate({message:"x",requestId:"req.ext.private",session:strongSession}),/privado externo nao autorizado/);

  const deniedByIdentity=createCreatorChatHandlerFromReasoningProvider(providers,capabilities,{
    providerId:"reasoner.creator.direct",
    allowExternal:true,
    allowPrivateExternalReasoning:true
  });
  await assert.rejects(()=>deniedByIdentity({message:"x",requestId:"req.ext.identity",session:strongSession}),/identidade\/endpoint verificado/);

  const deniedBySession=createCreatorChatHandlerFromReasoningProvider(providers,capabilities,{
    providerId:"reasoner.creator.direct",
    allowExternal:true,
    allowPrivateExternalReasoning:true,
    externalProviderIdentityVerified:true
  });
  await assert.rejects(()=>deniedBySession({message:"x",requestId:"req.ext.session",session:bootstrapSession}),/sessao forte/);

  assert.equal(calls,0);
});

test("explicitly authorized verified private-direct reasoning works with strong session without leaking host/session context",async()=>{
  let captured;
  const {providers,capabilities}=verifiedProvider({
    providerId:"reasoner.creator.direct-ok",
    transport:directTransport(),
    send:async(request,context)=>{
      captured={request,context};
      return providerResult(request,{text:"remote-private-ok"});
    }
  });
  const handler=createCreatorChatHandlerFromReasoningProvider(providers,capabilities,{
    providerId:"reasoner.creator.direct-ok",
    allowExternal:true,
    allowPrivateExternalReasoning:true,
    externalProviderIdentityVerified:true
  });
  const result=await handler({
    message:"analise este contexto privado",
    requestId:"req.creator.direct.ok",
    session:strongSession,
    context:{home:"/secret/path"}
  });

  assert.equal(result.provider.external,true);
  assert.equal(result.provider.transportKind,"private-direct");
  assert.equal(result.output.text,"remote-private-ok");
  assert.equal(captured.context.transportDecision.allowed,true);
  assert.equal(JSON.stringify(captured.request).includes("/secret/path"),false);
  assert.equal(JSON.stringify(captured.request).includes("creator:primary"),false);
});

test("Creator private chat cannot use repository-backed reasoning even with every external opt-in",async()=>{
  let calls=0;
  const {providers,capabilities}=verifiedProvider({
    providerId:"reasoner.creator.repo",
    transport:repoTransport(),
    send:async request=>{calls+=1;return providerResult(request,{text:"should-not-run"})}
  });
  const handler=createCreatorChatHandlerFromReasoningProvider(providers,capabilities,{
    providerId:"reasoner.creator.repo",
    allowExternal:true,
    allowPrivateExternalReasoning:true,
    externalProviderIdentityVerified:true
  });
  await assert.rejects(()=>handler({
    message:"conteudo privado",
    requestId:"req.creator.repo.denied",
    session:strongSession
  }),error=>{
    assert.ok(error?.decision?.reasons?.includes("repository-backed-private-payload-prohibited"));
    return true;
  });
  assert.equal(calls,0);
});

test("provider passport drift invalidates Creator reasoning before send",async()=>{
  let calls=0;
  const {providers,capabilities}=verifiedProvider({
    providerId:"reasoner.creator.drift",
    transport:localTransport(),
    send:async request=>{calls+=1;return providerResult(request,{text:"no"})}
  });
  capabilities.upsertParticipant({
    participantId:"reasoner.creator.drift",
    kind:"model",
    provider:"fixture",
    model:"fixture-v2",
    labels:{
      reasoningContract:"v1",
      transportId:"creator.local",
      transportKind:"local",
      transportHash:"b".repeat(64),
      external:false
    },
    capabilities:[{
      id:"reasoning",
      version:"1",
      input:["application/json"],
      output:["application/json"],
      networkRequired:false,
      humanReviewRequired:true,
      riskClass:"medium"
    }]
  },{source:"reasoning-provider-registry",updatedAt:"2026-09-17T23:11:00.000Z"});
  const handler=createCreatorChatHandlerFromReasoningProvider(providers,capabilities,{providerId:"reasoner.creator.drift"});
  await assert.rejects(()=>handler({
    message:"status",
    requestId:"req.creator.drift",
    session:bootstrapSession
  }),/capability reasoning verificada/);
  assert.equal(calls,0);
});
