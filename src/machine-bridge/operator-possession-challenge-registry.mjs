import {randomBytes} from "node:crypto";
import {assertOperatorChallengeStore} from "./operator-challenge-store.mjs";

export const OPERATOR_CHALLENGE_FORMAT="arca-operator-possession-challenge-v1";

export function createOperatorPossessionChallengeRegistry({clock=()=>new Date(),nonceBytes=24,store}={}){
  if(store)return createDurableRegistry({clock,nonceBytes,store:assertOperatorChallengeStore(store)});
  if(!Number.isInteger(nonceBytes)||nonceBytes<16)throw new TypeError("nonceBytes inválido");
  const pending=new Map(),consumed=new Set();
  return Object.freeze({
    issue({operatorId,ttlMs=60_000}){
      if(typeof operatorId!=="string"||!operatorId)throw new TypeError("operatorId obrigatório");
      if(!Number.isInteger(ttlMs)||ttlMs<1||ttlMs>60_000)throw new TypeError("ttlMs inválido");
      const issuedAt=clock(),expiresAt=new Date(issuedAt.getTime()+ttlMs),nonce=randomBytes(nonceBytes).toString("base64url");
      const challenge=Object.freeze({format:OPERATOR_CHALLENGE_FORMAT,operatorId,nonce,issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString()});pending.set(nonce,challenge);return challenge;
    },
    consume({operatorId,nonce}){
      if(consumed.has(nonce))throw new Error("ARCA_OPERATOR_CHALLENGE_REPLAY");
      const c=pending.get(nonce);if(!c)throw new Error("ARCA_OPERATOR_CHALLENGE_UNKNOWN");
      if(c.operatorId!==operatorId)throw new Error("ARCA_OPERATOR_CHALLENGE_IDENTITY_MISMATCH");
      if(clock().getTime()>Date.parse(c.expiresAt)){pending.delete(nonce);throw new Error("ARCA_OPERATOR_CHALLENGE_EXPIRED");}
      pending.delete(nonce);consumed.add(nonce);return c;
    },
    snapshot(){return Object.freeze({pending:pending.size,consumed:consumed.size,durable:false});}
  });
}

function createDurableRegistry({clock,nonceBytes,store}){
  return Object.freeze({
    async issue({operatorId,ttlMs=60_000}){if(typeof operatorId!=="string"||!operatorId)throw new TypeError("operatorId obrigatório");if(!Number.isInteger(ttlMs)||ttlMs<1||ttlMs>60_000)throw new TypeError("ttlMs inválido");const issuedAt=clock(),challenge=Object.freeze({format:OPERATOR_CHALLENGE_FORMAT,operatorId,nonce:randomBytes(nonceBytes).toString("base64url"),issuedAt:issuedAt.toISOString(),expiresAt:new Date(issuedAt.getTime()+ttlMs).toISOString()});await store.create(challenge);return challenge;},
    async consume({operatorId,nonce}){return store.consume({operatorId,nonce,now:clock().toISOString()});},
    snapshot(){return Object.freeze({durable:true,atomicConsume:true,store:store.descriptor??{}});}
  });
}
