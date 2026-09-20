import {createHash} from "node:crypto";
import {CapabilityRegistry} from "./capability-registry.ts";
import {
  ParticipantRuntimeBindingRegistry,
  RoleContractRegistry
} from "./cognitive-substitution.ts";
import {RoleConformanceRegistry} from "./role-conformance.ts";

export const ARCA_A2A_LIVE_RUNTIME_BINDING_RESULT_FORMAT="arca-a2a-live-runtime-binding-result-v1";

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function sha256Text(value){return createHash("sha256").update(String(value)).digest("hex")}
function expectHash(value,field){
  const text=String(value??"");
  if(!/^[a-f0-9]{64}$/.test(text))throw new TypeError(field+" must be SHA-256");
  return text;
}

export function bindVerifiedLiveA2aRuntime({
  capabilityRegistry,
  roleRegistry,
  conformanceRegistry,
  bindingRegistry,
  participantId,
  roleId,
  agentCardHash,
  interactionProfile,
  runtimeId,
  now=new Date()
}={}){
  if(!(capabilityRegistry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry required");
  if(!(roleRegistry instanceof RoleContractRegistry))throw new TypeError("RoleContractRegistry required");
  if(!(conformanceRegistry instanceof RoleConformanceRegistry))throw new TypeError("RoleConformanceRegistry required");
  if(!(bindingRegistry instanceof ParticipantRuntimeBindingRegistry))throw new TypeError("ParticipantRuntimeBindingRegistry required");

  const participant=String(participantId??"").trim();
  const roleKey=String(roleId??"").trim().toLowerCase();
  const runtimeKey=String(runtimeId??"").trim();
  if(!participant)throw new TypeError("participantId required");
  if(!roleKey)throw new TypeError("roleId required");
  if(!runtimeKey)throw new TypeError("runtimeId required");

  const passport=capabilityRegistry.getPassport(participant);
  if(!passport)throw new Error("participant not registered: "+participant);
  const role=roleRegistry.get(roleKey);
  if(!role)throw new Error("role contract not registered: "+roleKey);

  const cardHash=expectHash(agentCardHash,"agentCardHash");
  if(passport.labels?.sourceCardHash!==cardHash){
    throw new Error("Agent Card hash does not match participant registration");
  }

  if(!plain(interactionProfile))throw new TypeError("A2A interaction profile required");
  if(interactionProfile.publicUnauthenticated!==true||
     interactionProfile.authenticationSent!==false||
     interactionProfile.protocolBinding!=="JSONRPC"||
     interactionProfile.protocolVersion!=="1.0"||
     interactionProfile.method!=="SendMessage"){
    throw new Error("A2A interaction profile is not an eligible public JSON-RPC v1 runtime");
  }
  if(interactionProfile.sourceOrigin!==passport.labels?.protocolSourceOrigin &&
     passport.labels?.protocolSourceOrigin!==undefined){
    throw new Error("A2A source origin drifted from participant registration");
  }

  const requiredCapability=role.requiredCapabilities?.[0];
  const capability=(passport.capabilities??[]).find(item=>item.id===requiredCapability);
  if(!capability||capability.status!=="verified"){
    throw new Error("runtime binding requires verified role capability");
  }

  const resolvedConformance=conformanceRegistry.resolve(role,passport,{now});
  if(resolvedConformance.evidence.passed!==true){
    throw new Error("runtime binding requires passed RoleConformance");
  }

  const existing=bindingRegistry.get(participant);
  if(existing){
    if(existing.participantDescriptorHash!==passport.descriptorHash||
       existing.runtimeKind!=="endpoint"||
       existing.runtimeId!==runtimeKey){
      throw new Error("existing runtime binding conflicts with requested live A2A binding");
    }
    return Object.freeze({
      format:ARCA_A2A_LIVE_RUNTIME_BINDING_RESULT_FORMAT,
      version:1,
      participantId:participant,
      descriptorHash:passport.descriptorHash,
      agentCardHash:cardHash,
      roleId:role.roleId,
      roleContractHash:role.contractHash,
      roleConformanceProfileHash:resolvedConformance.profile.profileHash,
      roleConformanceEvidenceHash:resolvedConformance.evidence.evidenceHash,
      roleConformanceValidUntil:resolvedConformance.evidence.validUntil,
      runtimeKind:existing.runtimeKind,
      runtimeId:existing.runtimeId,
      runtimeEndpointOrigin:String(interactionProfile.endpointOrigin),
      runtimeEndpointHash:sha256Text(interactionProfile.endpoint),
      protocolProfile:interactionProfile.protocolBinding+"|"+interactionProfile.protocolVersion+"|"+interactionProfile.method,
      binding:existing,
      bindingCreated:false,
      executionAuthorized:false,
      trustGranted:false,
      admissionGranted:false
    });
  }

  const binding=bindingRegistry.bindPassport(passport,{
    runtimeKind:"endpoint",
    runtimeId:runtimeKey
  },{boundAt:now});

  return Object.freeze({
    format:ARCA_A2A_LIVE_RUNTIME_BINDING_RESULT_FORMAT,
    version:1,
    participantId:participant,
    descriptorHash:passport.descriptorHash,
    agentCardHash:cardHash,
    roleId:role.roleId,
    roleContractHash:role.contractHash,
    roleConformanceProfileHash:resolvedConformance.profile.profileHash,
    roleConformanceEvidenceHash:resolvedConformance.evidence.evidenceHash,
    roleConformanceValidUntil:resolvedConformance.evidence.validUntil,
    runtimeKind:binding.runtimeKind,
    runtimeId:binding.runtimeId,
    runtimeEndpointOrigin:String(interactionProfile.endpointOrigin),
    runtimeEndpointHash:sha256Text(interactionProfile.endpoint),
    protocolProfile:interactionProfile.protocolBinding+"|"+interactionProfile.protocolVersion+"|"+interactionProfile.method,
    binding,
    bindingCreated:true,
    executionAuthorized:false,
    trustGranted:false,
    admissionGranted:false
  });
}
