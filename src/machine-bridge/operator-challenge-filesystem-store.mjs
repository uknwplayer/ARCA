import {mkdir,open,readFile,rename,stat} from "node:fs/promises";
import {join} from "node:path";
import {createOperatorChallengeStoreAdapter} from "./operator-challenge-store.mjs";

const safe=v=>{if(typeof v!=="string"||!/^[A-Za-z0-9_-]{16,256}$/.test(v))throw new TypeError("nonce inválido");return v};
const exists=async p=>{try{await stat(p);return true}catch(e){if(e?.code==="ENOENT")return false;throw e}};

export async function createFilesystemOperatorChallengeStore({directory}){
  if(typeof directory!=="string"||!directory)throw new TypeError("directory obrigatório");
  const pending=join(directory,"pending"),consumed=join(directory,"consumed");await mkdir(pending,{recursive:true});await mkdir(consumed,{recursive:true});
  return createOperatorChallengeStoreAdapter({descriptor:{kind:"filesystem-v1"},
    async create(challenge){const nonce=safe(challenge?.nonce),path=join(pending,nonce+".json");let h;try{h=await open(path,"wx",0o600);await h.writeFile(JSON.stringify(challenge));await h.sync();}catch(e){if(e?.code==="EEXIST")throw new Error("ARCA_OPERATOR_CHALLENGE_DUPLICATE");throw e}finally{await h?.close();}},
    async consume({operatorId,nonce,now}){nonce=safe(nonce);const from=join(pending,nonce+".json"),to=join(consumed,nonce+".json");try{await rename(from,to);}catch(e){if(e?.code==="ENOENT"&&await exists(to))throw new Error("ARCA_OPERATOR_CHALLENGE_REPLAY");if(e?.code==="ENOENT")throw new Error("ARCA_OPERATOR_CHALLENGE_UNKNOWN");throw e}const c=JSON.parse(await readFile(to,"utf8"));if(c.operatorId!==operatorId)throw new Error("ARCA_OPERATOR_CHALLENGE_IDENTITY_MISMATCH");if(Date.parse(now)>Date.parse(c.expiresAt))throw new Error("ARCA_OPERATOR_CHALLENGE_EXPIRED");return Object.freeze(c);}
  });
}
