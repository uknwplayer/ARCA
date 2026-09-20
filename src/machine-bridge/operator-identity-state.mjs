export const OPERATOR_IDENTITY_STATES=Object.freeze(["generated","proof-pending","operational","rotating","retired","unavailable"]);
const ALLOWED=Object.freeze({
  generated:new Set(["proof-pending","unavailable"]),
  "proof-pending":new Set(["operational","unavailable"]),
  operational:new Set(["rotating","retired","unavailable"]),
  rotating:new Set(["proof-pending","retired","unavailable"]),
  unavailable:new Set(["proof-pending","retired"]),
  retired:new Set()
});
export function createOperatorIdentityState({operatorId,keyFingerprint,state="generated",revision=0}){
  if(typeof operatorId!=="string"||!operatorId)throw new TypeError("operatorId obrigatório");
  if(typeof keyFingerprint!=="string"||!keyFingerprint)throw new TypeError("keyFingerprint obrigatório");
  if(!OPERATOR_IDENTITY_STATES.includes(state))throw new TypeError("estado inválido");
  return Object.freeze({format:"arca-operator-identity-state-v1",operatorId,keyFingerprint,state,revision});
}
export function transitionOperatorIdentity(current,next,{proofVerified=false,newKeyFingerprint}={}){
  if(!current||current.format!=="arca-operator-identity-state-v1")throw new TypeError("identidade inválida");
  if(!ALLOWED[current.state]?.has(next))throw new Error("ARCA_OPERATOR_IDENTITY_TRANSITION_DENIED");
  if(next==="operational"&&!proofVerified)throw new Error("ARCA_OPERATOR_IDENTITY_PROOF_REQUIRED");
  if(current.state==="rotating"&&next==="proof-pending"&&!newKeyFingerprint)throw new Error("ARCA_OPERATOR_IDENTITY_ROTATION_KEY_REQUIRED");
  return createOperatorIdentityState({operatorId:current.operatorId,keyFingerprint:newKeyFingerprint??current.keyFingerprint,state:next,revision:current.revision+1});
}
