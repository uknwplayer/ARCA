import {createHash,createPublicKey} from "node:crypto";
import {createMeshNodeIdentity,MeshIdentityTrustStore} from "./mesh-identity.mjs";

export function operationalIdentityToMeshIdentity({identityState,publicKeySpki}){
  if(!identityState||identityState.format!=="arca-operator-identity-state-v1")throw new TypeError("estado de identidade inválido");
  if(identityState.state!=="operational")throw new Error("ARCA_MESH_TRUST_REQUIRES_OPERATIONAL_IDENTITY");
  const publicKey=createPublicKey({key:Buffer.from(publicKeySpki,"base64"),type:"spki",format:"der"});
  const meshIdentity=createMeshNodeIdentity({nodeId:identityState.operatorId,publicKey});
  const signerFingerprint=createHash("sha256").update(publicKeySpki).digest("hex");
  if(signerFingerprint!==identityState.keyFingerprint)throw new Error("ARCA_MESH_TRUST_FINGERPRINT_MISMATCH");
  return meshIdentity;
}

export function trustOperationalOperator({trustStore=new MeshIdentityTrustStore(),identityState,publicKeySpki}){
  const meshIdentity=operationalIdentityToMeshIdentity({identityState,publicKeySpki});
  trustStore.trust(meshIdentity);
  return Object.freeze({trustStore,meshIdentity});
}
