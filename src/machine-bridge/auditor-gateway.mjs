import {createHash} from "node:crypto";
const sha=v=>createHash("sha256").update(v).digest("hex");
const ID=/^[A-Za-z0-9._:/-]{1,240}$/;
export class AuditorGateway {
 #sources; #events=[];
 constructor({sources={},now=()=>new Date()}){this.#sources=new Map(Object.entries(sources));this.now=now;}
 async read({agentId,source,resource}){
  if(!ID.test(agentId??"")||!ID.test(source??"")||typeof resource!=="string"||!resource||resource.length>1000) throw new Error("ARCA_AUDITOR_INVALID_REQUEST");
  const adapter=this.#sources.get(source); if(!adapter||typeof adapter.read!=="function") throw new Error("ARCA_AUDITOR_SOURCE_NOT_ALLOWED");
  const result=await adapter.read({resource});
  if(result==null) throw new Error("ARCA_AUDITOR_RESOURCE_NOT_FOUND");
  const serialized=JSON.stringify(result);
  const event={format:"arca-auditor-read-event-v1",version:1,agentId,source,resourceHash:sha(resource),resultHash:sha(serialized),readAt:this.now().toISOString()};
  this.#events.push(event);
  return structuredClone(result);
 }
 events(){return structuredClone(this.#events);}
}
export function createReadOnlySource({read}){if(typeof read!=="function")throw new Error("ARCA_AUDITOR_INVALID_SOURCE");return Object.freeze({read});}
