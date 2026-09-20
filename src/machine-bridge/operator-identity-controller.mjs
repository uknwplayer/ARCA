import {createPublicKey,verify} from "node:crypto";
import {createOperatorIdentityState,transitionOperatorIdentity} from "./operator-identity-state.mjs";
import {OPERATOR_POSSESSION_DOMAIN,operatorKeyFingerprint} from "./operator-signer.mjs";

function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v}
const bytes=v=>Buffer.from(JSON.stringify(stable(v)));

export function verifyOperatorPossessionProof(proof,{now=new Date(),expectedNonce}={}){
  if(!proof||proof.domain!==OPERATOR_POSSESSION_DOMAIN)throw new Error("ARCA_OPERATOR_PROOF_DOMAIN_INVALID");
  if(expectedNonce&&proof.nonce!==expectedNonce)throw new Error("ARCA_OPERATOR_PROOF_NONCE_INVALID");
  const issued=Date.parse(proof.issuedAt),expires=Date.parse(proof.expiresAt),time=now.getTime();
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||expires<=issued||expires-issued>60_000||time<issued||time>expires)throw new Error("ARCA_OPERATOR_PROOF_TIME_INVALID");
  const key=createPublicKey({key:Buffer.from(proof.publicKeySpki,"base64"),type:"spki",format:"der"});
  if(operatorKeyFingerprint(proof.publicKeySpki)!==proof.keyFingerprint)throw new Error("ARCA_OPERATOR_PROOF_FINGERPRINT_INVALID");
  const challenge={domain:proof.domain,operatorId:proof.operatorId,keyFingerprint:proof.keyFingerprint,nonce:proof.nonce,issuedAt:proof.issuedAt,expiresAt:proof.expiresAt};
  if(!verify(null,bytes(challenge),key,Buffer.from(proof.signature,"base64url")))throw new Error("ARCA_OPERATOR_PROOF_SIGNATURE_INVALID");
  return Object.freeze({verified:true,operatorId:proof.operatorId,keyFingerprint:proof.keyFingerprint});
}

export function createOperatorIdentityController({operatorId,keyFingerprint,challengeRegistry}){
  let state=createOperatorIdentityState({operatorId,keyFingerprint});
  return Object.freeze({
    snapshot:()=>state,
    beginProof(){state=transitionOperatorIdentity(state,"proof-pending");return state},
    async issueProofChallenge({ttlMs=60_000}={}){if(!challengeRegistry)throw new Error("ARCA_OPERATOR_CHALLENGE_REGISTRY_REQUIRED");state=state.state==="generated"?transitionOperatorIdentity(state,"proof-pending"):state;return challengeRegistry.issue({operatorId:state.operatorId,ttlMs})},
    acceptProof(proof,options){const v=verifyOperatorPossessionProof(proof,options);if(v.operatorId!==state.operatorId||v.keyFingerprint!==state.keyFingerprint)throw new Error("ARCA_OPERATOR_PROOF_IDENTITY_MISMATCH");state=transitionOperatorIdentity(state,"operational",{proofVerified:true});return state},
    async acceptChallengeProof(proof,{now=new Date()}={}){if(!challengeRegistry)throw new Error("ARCA_OPERATOR_CHALLENGE_REGISTRY_REQUIRED");const v=verifyOperatorPossessionProof(proof,{now,expectedNonce:proof?.nonce});if(v.operatorId!==state.operatorId||v.keyFingerprint!==state.keyFingerprint)throw new Error("ARCA_OPERATOR_PROOF_IDENTITY_MISMATCH");await challengeRegistry.consume({operatorId:state.operatorId,nonce:proof.nonce});state=transitionOperatorIdentity(state,"operational",{proofVerified:true});return state},
    markUnavailable(){state=transitionOperatorIdentity(state,"unavailable");return state}
  });
}
