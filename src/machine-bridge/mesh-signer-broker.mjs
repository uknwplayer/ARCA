import {createPrivateKey} from "node:crypto";
import {
  signMeshNodeAdvertisement,
  signMeshReceipt,
  signMeshRequestEvidence,
  signMeshCognitiveSubstitutionReceipt,
  signMeshReconciledFailoverReceipt,
  verifyMeshNodeIdentity
} from "./mesh-identity.mjs";

export const ARCA_MESH_SIGNER_BROKER_FORMAT="arca-mesh-signer-broker-v1";

const VAULT_REF=/^vault:\/\/[A-Za-z0-9._/-]{1,180}$/;
const MAX_KEY_BYTES=64*1024;

function normalizeRef(value){
  const ref=String(value??"").trim();
  if(!VAULT_REF.test(ref))throw new Error("mesh signer broker requires vault:// keyRef");
  return ref;
}
function normalizeIdentity(identity){
  if(!verifyMeshNodeIdentity(identity))throw new Error("mesh signer broker requires valid Mesh identity");
  return identity;
}
function publicDescriptor(identity){
  return Object.freeze({
    format:ARCA_MESH_SIGNER_BROKER_FORMAT,
    version:1,
    nodeId:identity.nodeId,
    identityId:identity.identityId,
    keyFingerprint:identity.keyFingerprint,
    keySource:"vault",
    supportedOperations:Object.freeze([
      "node-advertisement",
      "receipt",
      "request-evidence",
      "cognitive-substitution-receipt",
      "reconciled-failover-receipt"
    ])
  });
}
function sanitizeSigningError(error){
  const message=String(error?.message||"").toLowerCase();
  const mismatch=message.includes("does not match identity")||message.includes("fingerprint");
  const out=new Error(mismatch
    ?"mesh signer key does not match configured identity"
    :"mesh signer key unavailable or invalid");
  out.code=mismatch?"ARCA_MESH_SIGNER_IDENTITY_MISMATCH":"ARCA_MESH_SIGNER_KEY_UNAVAILABLE";
  return out;
}

export function createVaultMeshSignerBroker({
  vault,
  identity,
  keyRef
}={}){
  if(!vault||typeof vault.withCredential!=="function")throw new TypeError("mesh signer broker vault.withCredential() required");
  const signerIdentity=normalizeIdentity(identity);
  const privateKeyRef=normalizeRef(keyRef);
  const descriptor=publicDescriptor(signerIdentity);

  async function withSigner(purpose,consumer){
    try{
      const auditPurpose="mesh-sign:"+purpose+":"+signerIdentity.nodeId;
      return await vault.withCredential(privateKeyRef,auditPurpose,async secretBytes=>{
        if(!(secretBytes instanceof Uint8Array))throw new Error("invalid key material");
        if(secretBytes.byteLength<32||secretBytes.byteLength>MAX_KEY_BYTES)throw new Error("invalid key material");
        const key=createPrivateKey(secretBytes);
        if(key.asymmetricKeyType!=="ed25519")throw new Error("invalid key material");
        return consumer(Object.freeze({identity:signerIdentity,privateKey:key}));
      });
    }catch(error){
      throw sanitizeSigningError(error);
    }
  }

  return Object.freeze({
    format:ARCA_MESH_SIGNER_BROKER_FORMAT,
    version:1,
    identity:signerIdentity,
    descriptor:()=>descriptor,

    async signNodeAdvertisement(advertisement,options={}){
      return withSigner("node-advertisement",signer=>signMeshNodeAdvertisement(advertisement,signer,options));
    },

    async signReceipt(receipt,options={}){
      return withSigner("receipt",signer=>signMeshReceipt(receipt,signer,options));
    },

    async signRequestEvidence(evidence,options={}){
      return withSigner("request-evidence",signer=>signMeshRequestEvidence(evidence,signer,options));
    },

    async signCognitiveSubstitutionReceipt(receipt,options={}){
      return withSigner("cognitive-substitution-receipt",signer=>signMeshCognitiveSubstitutionReceipt(receipt,signer,options));
    }
,
    async signReconciledFailoverReceipt(receipt,options={}){
      return withSigner("reconciled-failover-receipt",signer=>signMeshReconciledFailoverReceipt(receipt,signer,options));
    }
  });
}
