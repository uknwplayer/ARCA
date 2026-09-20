import {createPrivateKey,createPublicKey,sign as cryptoSign} from "node:crypto";
import {workDispatchPublicKeyFingerprint} from "./work-dispatch-v1.mjs";

export const ARCA_WORK_DISPATCH_SIGNER_BROKER_FORMAT="arca-work-dispatch-signer-broker-v1";

const VAULT_REF=/^vault:\/\/[A-Za-z0-9._/-]{1,180}$/;
const MAX_KEY_BYTES=64*1024;

function normalizeRef(value){
  const ref=String(value??"").trim();
  if(!VAULT_REF.test(ref))throw new Error("work dispatch signer broker requires vault:// keyRef");
  return ref;
}
function sanitize(error){
  const message=String(error?.message??"").toLowerCase();
  const mismatch=message.includes("fingerprint")||message.includes("does not match");
  const out=new Error(mismatch?"work dispatch signer key does not match configured public key":"work dispatch signer key unavailable or invalid");
  out.code=mismatch?"ARCA_WORK_SIGNER_IDENTITY_MISMATCH":"ARCA_WORK_SIGNER_KEY_UNAVAILABLE";
  return out;
}

export function createVaultWorkDispatchSignerBroker({vault,publicKeySpki,keyFingerprint,keyRef}={}){
  if(!vault||typeof vault.withCredential!=="function")throw new TypeError("work dispatch signer broker vault.withCredential() required");
  const publicSpki=String(publicKeySpki??"").trim();
  if(!publicSpki)throw new Error("work dispatch signer broker publicKeySpki required");
  const fingerprint=workDispatchPublicKeyFingerprint(publicSpki);
  if(keyFingerprint!==undefined&&String(keyFingerprint).trim().toLowerCase()!==fingerprint)throw new Error("work dispatch signer broker fingerprint mismatch");
  const privateKeyRef=normalizeRef(keyRef);
  const descriptor=Object.freeze({
    format:ARCA_WORK_DISPATCH_SIGNER_BROKER_FORMAT,
    version:1,
    algorithm:"Ed25519",
    keyFingerprint:fingerprint,
    keySource:"vault",
    supportedOperations:Object.freeze(["work-dispatch-sign"])
  });
  return Object.freeze({
    format:ARCA_WORK_DISPATCH_SIGNER_BROKER_FORMAT,
    version:1,
    publicKeySpki:publicSpki,
    keyFingerprint:fingerprint,
    descriptor:()=>descriptor,
    async sign(bytes){
      if(!(bytes instanceof Uint8Array))throw new TypeError("work dispatch signer bytes required");
      try{
        return await vault.withCredential(privateKeyRef,"work-dispatch-sign:"+fingerprint.slice(7,23),async secretBytes=>{
          if(!(secretBytes instanceof Uint8Array)||secretBytes.byteLength<32||secretBytes.byteLength>MAX_KEY_BYTES)throw new Error("invalid key material");
          const privateKey=createPrivateKey(secretBytes);
          if(privateKey.asymmetricKeyType!=="ed25519")throw new Error("invalid key material");
          const derived=createPublicKey(privateKey).export({type:"spki",format:"der"});
          const derivedFingerprint=workDispatchPublicKeyFingerprint(Buffer.from(derived));
          if(derivedFingerprint!==fingerprint)throw new Error("fingerprint mismatch");
          return cryptoSign(null,Buffer.from(bytes),privateKey).toString("base64url");
        });
      }catch(error){throw sanitize(error)}
    }
  });
}
