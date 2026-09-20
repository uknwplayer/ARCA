import {createHash} from "node:crypto";
import {assertMachineBridgeJobV3} from "./protocol-v3.mjs";

export const ARCA_EXECUTION_ENDPOINT_FORMAT="arca-execution-endpoint-v1";
export const ARCA_EXECUTION_WAKE_FORMAT="arca-execution-wake-v1";
export const ARCA_EXECUTION_OPERATION_FORMAT="arca-execution-endpoint-operation-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_CAP=/^[A-Za-z0-9._:-]{1,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const PARTICIPANT_KINDS=new Set(["agent","worker","service"]);
const OPERATIONS=Object.freeze(["wake","claim","heartbeat","result","ack","handoff"]);

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(plain(value)){
    const out={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonical(value[key]);
    return out;
  }
  return value;
}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:JSON.stringify(canonical(value))).digest("hex")}
function safeId(value,label){const out=String(value??"").trim();if(!SAFE_ID.test(out))throw new Error(`ARCA_EXECUTION_ENDPOINT_${label.toUpperCase()}_INVALID`);return out}
function safeText(value,label,max=512){const out=String(value??"").trim();if(!out||out.length>max||/[\u0000-\u001f\u007f]/.test(out))throw new Error(`ARCA_EXECUTION_ENDPOINT_${label.toUpperCase()}_INVALID`);return out}
function capabilities(values=[]){
  if(!Array.isArray(values))throw new Error("ARCA_EXECUTION_ENDPOINT_CAPABILITIES_INVALID");
  const out=[...new Set(values.map(value=>String(value??"").trim()).filter(Boolean))].sort();
  if(out.some(value=>!SAFE_CAP.test(value)))throw new Error("ARCA_EXECUTION_ENDPOINT_CAPABILITY_INVALID");
  return out;
}
function operationFlags(input={}){
  if(!plain(input))throw new Error("ARCA_EXECUTION_ENDPOINT_OPERATIONS_INVALID");
  const out={discover:true,capabilities:true};
  for(const operation of OPERATIONS)out[operation]=input[operation]===true;
  return Object.freeze(out);
}
function publicTransport(input){
  if(!plain(input))throw new Error("ARCA_EXECUTION_ENDPOINT_TRANSPORT_INVALID");
  const kind=safeId(input.kind,"transport_kind");
  const metadata={};
  for(const [key,value] of Object.entries(input)){
    if(key==="kind")continue;
    if(/token|secret|password|authorization|credential/i.test(key))throw new Error("ARCA_EXECUTION_ENDPOINT_TRANSPORT_SECRET_FIELD_FORBIDDEN");
    if(value===null||["string","number","boolean"].includes(typeof value))metadata[key]=value;
    else if(Array.isArray(value)&&value.every(item=>["string","number","boolean"].includes(typeof item)))metadata[key]=[...value];
    else throw new Error("ARCA_EXECUTION_ENDPOINT_TRANSPORT_METADATA_INVALID");
  }
  return Object.freeze({kind,...metadata});
}
export function createExecutionEndpointDescriptor({endpointId,participantKind="agent",capabilities:provided=[],operations={},transport}={}){
  const id=safeId(endpointId,"id");
  if(!PARTICIPANT_KINDS.has(participantKind))throw new Error("ARCA_EXECUTION_ENDPOINT_PARTICIPANT_KIND_INVALID");
  return Object.freeze({
    format:ARCA_EXECUTION_ENDPOINT_FORMAT,
    version:1,
    endpointId:id,
    participantKind,
    capabilities:Object.freeze(capabilities(provided)),
    operations:operationFlags(operations),
    transport:publicTransport(transport),
    authority:Object.freeze({
      trustGranted:false,
      codeMutation:false,
      canonicalWrite:false,
      executionAuthority:false
    })
  });
}
export function createExecutionWakeEnvelope({endpointId,requestId,taskRef,taskHash,eventId=null,reason="capability-dispatch",createdAt=new Date().toISOString()}={}){
  const body={
    format:ARCA_EXECUTION_WAKE_FORMAT,
    version:1,
    endpointId:safeId(endpointId,"id"),
    requestId:safeId(requestId,"request_id"),
    taskRef:safeText(taskRef,"task_ref"),
    taskHash:String(taskHash??"").trim().toLowerCase(),
    eventId:eventId===null?null:String(eventId).trim().toLowerCase(),
    reason:safeText(reason,"reason",160),
    createdAt:new Date(createdAt).toISOString(),
    authority:Object.freeze({trustGranted:false,codeMutation:false,canonicalWrite:false,executionAuthority:false})
  };
  if(!HASH.test(body.taskHash))throw new Error("ARCA_EXECUTION_ENDPOINT_TASK_HASH_INVALID");
  if(body.eventId!==null&&!HASH.test(body.eventId))throw new Error("ARCA_EXECUTION_ENDPOINT_EVENT_ID_INVALID");
  return Object.freeze({...body,wakeId:sha256(body)});
}
export function machineBridgeJobTaskHash(job){assertMachineBridgeJobV3(job);return sha256(job)}

export class ExecutionEndpointRegistry{
  #entries=new Map();
  register(descriptor,adapter={}){
    if(!descriptor||descriptor.format!==ARCA_EXECUTION_ENDPOINT_FORMAT)throw new Error("ARCA_EXECUTION_ENDPOINT_DESCRIPTOR_INVALID");
    const normalized=createExecutionEndpointDescriptor(descriptor);
    if(this.#entries.has(normalized.endpointId))throw new Error("ARCA_EXECUTION_ENDPOINT_DUPLICATE");
    if(!plain(adapter))throw new Error("ARCA_EXECUTION_ENDPOINT_ADAPTER_INVALID");
    for(const operation of OPERATIONS){
      const implemented=typeof adapter[operation]==="function";
      if(normalized.operations[operation]!==implemented)throw new Error(`ARCA_EXECUTION_ENDPOINT_OPERATION_BINDING_INVALID:${operation}`);
    }
    this.#entries.set(normalized.endpointId,Object.freeze({descriptor:normalized,adapter}));
    return normalized;
  }
  get(endpointId){return this.#entries.get(endpointId)?.descriptor??null}
  list(){return [...this.#entries.values()].map(entry=>entry.descriptor).sort((a,b)=>a.endpointId.localeCompare(b.endpointId))}
  discover({capability=null}={}){
    const requested=capability===null?null:String(capability).trim();
    if(requested!==null&&!SAFE_CAP.test(requested))throw new Error("ARCA_EXECUTION_ENDPOINT_CAPABILITY_INVALID");
    return this.list().filter(endpoint=>requested===null||endpoint.capabilities.includes(requested));
  }
  capabilities(endpointId){const endpoint=this.get(endpointId);if(!endpoint)throw new Error("ARCA_EXECUTION_ENDPOINT_NOT_FOUND");return [...endpoint.capabilities]}
  async #invoke(endpointId,operation,input){
    const entry=this.#entries.get(endpointId);
    if(!entry)throw new Error("ARCA_EXECUTION_ENDPOINT_NOT_FOUND");
    if(!OPERATIONS.includes(operation)||entry.descriptor.operations[operation]!==true){
      const error=new Error(`Execution endpoint operation unsupported: ${operation}`);
      error.code="ARCA_EXECUTION_ENDPOINT_OPERATION_UNSUPPORTED";
      throw error;
    }
    const receipt=await entry.adapter[operation](input,entry.descriptor);
    return Object.freeze({format:ARCA_EXECUTION_OPERATION_FORMAT,endpointId,operation,receipt:receipt??null});
  }
  async wake(endpointId,input={}){
    const wake=createExecutionWakeEnvelope({...input,endpointId});
    const operation=await this.#invoke(endpointId,"wake",wake);
    return Object.freeze({...operation,wake});
  }
  claim(endpointId,input={}){return this.#invoke(endpointId,"claim",input)}
  heartbeat(endpointId,input={}){return this.#invoke(endpointId,"heartbeat",input)}
  result(endpointId,input={}){return this.#invoke(endpointId,"result",input)}
  ack(endpointId,input={}){return this.#invoke(endpointId,"ack",input)}
  handoff(endpointId,input={}){return this.#invoke(endpointId,"handoff",input)}
}

export async function wakeExecutionEndpointForJob({registry,endpointId,job,eventId=null,createdAt=new Date().toISOString()}={}){
  if(!(registry instanceof ExecutionEndpointRegistry))throw new Error("ARCA_EXECUTION_ENDPOINT_REGISTRY_REQUIRED");
  assertMachineBridgeJobV3(job);
  return registry.wake(endpointId,{
    requestId:job.requestId??job.jobId,
    taskRef:`machine-bridge:${job.jobId}`,
    taskHash:machineBridgeJobTaskHash(job),
    eventId,
    reason:`machine-bridge:${job.action}`,
    createdAt
  });
}
