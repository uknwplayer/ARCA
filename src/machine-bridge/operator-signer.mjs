import {createHash,createPublicKey,verify} from "node:crypto";

export const OPERATOR_SIGNER_FORMAT="arca-operator-signer-v1";
export const OPERATOR_POSSESSION_DOMAIN="arca.machine-bridge.operator-possession.v1";

function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v}
const bytes=v=>Buffer.from(JSON.stringify(stable(v)));
const sha=v=>createHash("sha256").update(typeof v==="string"?v:bytes(v)).digest("hex");
export const operatorKeyFingerprint=publicKeySpki=>sha(publicKeySpki);

export function createOperatorSigner({operatorId,publicKeySpki,signBytes}){
  if(typeof operatorId!=="string"||!operatorId)throw new TypeError("operatorId obrigatório");
  if(typeof publicKeySpki!=="string"||!publicKeySpki)throw new TypeError("publicKeySpki obrigatório");
  if(typeof signBytes!=="function")throw new TypeError("signBytes obrigatório");
  const key=createPublicKey({key:Buffer.from(publicKeySpki,"base64"),type:"spki",format:"der"});
  if(key.asymmetricKeyType!=="ed25519")throw new TypeError("somente Ed25519");
  const fingerprint=operatorKeyFingerprint(publicKeySpki);
  return Object.freeze({format:OPERATOR_SIGNER_FORMAT,operatorId,algorithm:"Ed25519",publicKeySpki,keyFingerprint:fingerprint,async sign(payload){const data=bytes(payload);const signature=await signBytes(data);if(!Buffer.isBuffer(signature))throw new TypeError("signBytes deve retornar Buffer");if(!verify(null,data,key,signature))throw new Error("ARCA_OPERATOR_SIGNER_POSSESSION_FAILED");return signature.toString("base64url")}});
}

export async function createPossessionProof({signer,nonce,issuedAt=new Date().toISOString(),expiresAt}){
  if(!signer||signer.format!==OPERATOR_SIGNER_FORMAT)throw new TypeError("signer inválido");
  if(typeof nonce!=="string"||nonce.length<16)throw new TypeError("nonce inválido");
  const expiry=expiresAt??new Date(Date.parse(issuedAt)+60_000).toISOString();
  const challenge={domain:OPERATOR_POSSESSION_DOMAIN,operatorId:signer.operatorId,keyFingerprint:signer.keyFingerprint,nonce,issuedAt,expiresAt:expiry};
  return {...challenge,publicKeySpki:signer.publicKeySpki,signature:await signer.sign(challenge)};
}
