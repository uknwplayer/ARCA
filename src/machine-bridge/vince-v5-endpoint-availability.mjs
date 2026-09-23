import {ExecutionEndpointRegistry} from "./execution-endpoint.mjs";

export const ARCA_VINCE_V5_AVAILABILITY_FORMAT="arca-vince-v5-endpoint-availability-v1";
export const ARCA_VINCE_V5_ROUTE_FORMAT="arca-vince-v5-route-selection-v1";
export const VINCE_V5_AVAILABILITY_STATES=Object.freeze([
  "AVAILABLE",
  "UNREACHABLE",
  "INCONCLUSIVE"
]);

const SAFE_ID=/^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_CAP=/^[A-Za-z0-9._:-]{1,128}$/;
const STATES=new Set(VINCE_V5_AVAILABILITY_STATES);

function iso(value,label){
  const text=String(value??"").trim();
  const millis=Date.parse(text);
  if(!text||!Number.isFinite(millis))
    throw new Error(`ARCA_VINCE_V5_${label}_INVALID`);
  return {text:new Date(millis).toISOString(),millis};
}
function finiteDuration(value,label,{min=1,max=86_400_000}={}){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`ARCA_VINCE_V5_${label}_INVALID`);
  return n;
}
function endpointId(value){
  const out=String(value??"").trim();
  if(!SAFE_ID.test(out))throw new Error("ARCA_VINCE_V5_ENDPOINT_ID_INVALID");
  return out;
}
function capability(value){
  if(value===null||value===undefined)return null;
  const out=String(value).trim();
  if(!SAFE_CAP.test(out))throw new Error("ARCA_VINCE_V5_CAPABILITY_INVALID");
  return out;
}
function errorCode(error){
  const raw=String(error?.code??error?.name??"ERROR").trim().toUpperCase();
  return /^[A-Z0-9_.:-]{1,160}$/.test(raw)?raw:"ERROR";
}
function observation({
  endpointId:rawEndpointId,
  state,
  reason,
  observedAt,
  validUntil,
  source,
  surfaceReachable=false,
  wakeAcknowledged=false,
  routeEligible=false,
  evidence={}
}){
  const id=endpointId(rawEndpointId);
  if(!STATES.has(state))throw new Error("ARCA_VINCE_V5_STATE_INVALID");
  const observed=iso(observedAt,"OBSERVED_AT");
  const valid=iso(validUntil,"VALID_UNTIL");
  if(valid.millis<observed.millis)throw new Error("ARCA_VINCE_V5_VALIDITY_WINDOW_INVALID");
  const reasonText=String(reason??"").trim();
  const sourceText=String(source??"").trim();
  if(!reasonText||reasonText.length>160)throw new Error("ARCA_VINCE_V5_REASON_INVALID");
  if(!sourceText||sourceText.length>80)throw new Error("ARCA_VINCE_V5_SOURCE_INVALID");
  return Object.freeze({
    format:ARCA_VINCE_V5_AVAILABILITY_FORMAT,
    version:1,
    endpointId:id,
    state,
    reason:reasonText,
    source:sourceText,
    observedAt:observed.text,
    validUntil:valid.text,
    surfaceReachable:surfaceReachable===true,
    wakeAcknowledged:wakeAcknowledged===true,
    routeEligible:routeEligible===true,
    evidence:Object.freeze({...evidence}),
    authority:Object.freeze({
      trustGranted:false,
      codeMutation:false,
      canonicalWrite:false,
      executionAuthority:false
    })
  });
}
function windowFrom(nowMillis,durationMs){
  return new Date(nowMillis+durationMs).toISOString();
}
function assertRegistry(registry){
  if(!(registry instanceof ExecutionEndpointRegistry))
    throw new Error("ARCA_VINCE_V5_ENDPOINT_REGISTRY_REQUIRED");
}
function descriptorFor(registry,id){
  const descriptor=registry.get(id);
  if(!descriptor)throw new Error("ARCA_EXECUTION_ENDPOINT_NOT_FOUND");
  return descriptor;
}

export async function probeVinceV5Heartbeat({
  registry,
  endpointId:rawEndpointId,
  now=new Date().toISOString(),
  observationTtlMs=60_000
}={}){
  assertRegistry(registry);
  const id=endpointId(rawEndpointId);
  const descriptor=descriptorFor(registry,id);
  const clock=iso(now,"NOW");
  const ttl=finiteDuration(observationTtlMs,"OBSERVATION_TTL_MS");

  if(descriptor.operations.heartbeat!==true){
    return observation({
      endpointId:id,
      state:"INCONCLUSIVE",
      reason:"HEARTBEAT_UNSUPPORTED",
      observedAt:clock.text,
      validUntil:windowFrom(clock.millis,ttl),
      source:"heartbeat",
      evidence:{operationDeclared:false}
    });
  }

  try{
    const result=await registry.heartbeat(id,{observedAt:clock.text});
    const receipt=result?.receipt??null;
    if(receipt?.available===false){
      return observation({
        endpointId:id,
        state:"UNREACHABLE",
        reason:"EXPLICIT_HEARTBEAT_UNAVAILABLE",
        observedAt:clock.text,
        validUntil:windowFrom(clock.millis,ttl),
        source:"heartbeat",
        evidence:{operationDeclared:true,explicitAvailable:false}
      });
    }
    if(receipt?.available===true){
      return observation({
        endpointId:id,
        state:"INCONCLUSIVE",
        reason:"SURFACE_REACHABLE_EXECUTION_UNPROVEN",
        observedAt:clock.text,
        validUntil:windowFrom(clock.millis,ttl),
        source:"heartbeat",
        surfaceReachable:true,
        evidence:{
          operationDeclared:true,
          explicitAvailable:true,
          workExecutionObserved:receipt?.workExecutionObserved===true,
          executionObserved:receipt?.executionObserved===true
        }
      });
    }
    return observation({
      endpointId:id,
      state:"INCONCLUSIVE",
      reason:"HEARTBEAT_NONDEFINITIVE",
      observedAt:clock.text,
      validUntil:windowFrom(clock.millis,ttl),
      source:"heartbeat",
      evidence:{operationDeclared:true,explicitAvailable:null}
    });
  }catch(error){
    return observation({
      endpointId:id,
      state:"INCONCLUSIVE",
      reason:"HEARTBEAT_ERROR",
      observedAt:clock.text,
      validUntil:windowFrom(clock.millis,ttl),
      source:"heartbeat",
      evidence:{operationDeclared:true,errorCode:errorCode(error)}
    });
  }
}

export async function observeVinceV5Ack({
  registry,
  endpointId:rawEndpointId,
  ackInput={},
  now=new Date().toISOString(),
  maxAckAgeMs=300_000,
  futureSkewMs=30_000
}={}){
  assertRegistry(registry);
  const id=endpointId(rawEndpointId);
  const descriptor=descriptorFor(registry,id);
  const clock=iso(now,"NOW");
  const maxAge=finiteDuration(maxAckAgeMs,"MAX_ACK_AGE_MS");
  const futureSkew=finiteDuration(futureSkewMs,"FUTURE_SKEW_MS",{min:0,max:300_000});

  if(descriptor.operations.ack!==true){
    return observation({
      endpointId:id,
      state:"INCONCLUSIVE",
      reason:"ACK_UNSUPPORTED",
      observedAt:clock.text,
      validUntil:windowFrom(clock.millis,maxAge),
      source:"ack",
      evidence:{operationDeclared:false}
    });
  }

  let result;
  try{
    result=await registry.ack(id,ackInput);
  }catch(error){
    return observation({
      endpointId:id,
      state:"INCONCLUSIVE",
      reason:"ACK_OBSERVATION_ERROR",
      observedAt:clock.text,
      validUntil:windowFrom(clock.millis,maxAge),
      source:"ack",
      evidence:{operationDeclared:true,errorCode:errorCode(error)}
    });
  }

  const receipt=result?.receipt??null;
  if(receipt?.acknowledged!==true){
    return observation({
      endpointId:id,
      state:"INCONCLUSIVE",
      reason:"ACK_NOT_OBSERVED",
      observedAt:clock.text,
      validUntil:windowFrom(clock.millis,maxAge),
      source:"ack",
      surfaceReachable:true,
      evidence:{operationDeclared:true,acknowledged:false}
    });
  }

  let ackTime;
  try{ackTime=iso(receipt?.observedAt,"ACK_OBSERVED_AT")}
  catch{
    return observation({
      endpointId:id,
      state:"INCONCLUSIVE",
      reason:"ACK_TIME_INVALID",
      observedAt:clock.text,
      validUntil:windowFrom(clock.millis,maxAge),
      source:"ack",
      surfaceReachable:true,
      wakeAcknowledged:true,
      evidence:{operationDeclared:true,acknowledged:true}
    });
  }

  const age=clock.millis-ackTime.millis;
  if(age< -futureSkew){
    return observation({
      endpointId:id,
      state:"INCONCLUSIVE",
      reason:"ACK_TIME_IN_FUTURE",
      observedAt:clock.text,
      validUntil:windowFrom(clock.millis,maxAge),
      source:"ack",
      surfaceReachable:true,
      wakeAcknowledged:true,
      evidence:{operationDeclared:true,acknowledged:true,ackObservedAt:ackTime.text}
    });
  }
  if(age>maxAge){
    return observation({
      endpointId:id,
      state:"INCONCLUSIVE",
      reason:"ACK_STALE",
      observedAt:clock.text,
      validUntil:clock.text,
      source:"ack",
      surfaceReachable:true,
      wakeAcknowledged:true,
      evidence:{
        operationDeclared:true,
        acknowledged:true,
        ackObservedAt:ackTime.text,
        ageMs:age
      }
    });
  }

  return observation({
    endpointId:id,
    state:"AVAILABLE",
    reason:"RECENT_CORRELATED_ACK",
    observedAt:clock.text,
    validUntil:new Date(ackTime.millis+maxAge).toISOString(),
    source:"ack",
    surfaceReachable:true,
    wakeAcknowledged:true,
    routeEligible:true,
    evidence:{
      operationDeclared:true,
      acknowledged:true,
      ackObservedAt:ackTime.text,
      ageMs:Math.max(0,age)
    }
  });
}

export function selectVinceV5Route({
  registry,
  capability:requestedCapability=null,
  observations=[],
  now=new Date().toISOString()
}={}){
  assertRegistry(registry);
  const cap=capability(requestedCapability);
  const clock=iso(now,"NOW");
  if(!Array.isArray(observations))throw new Error("ARCA_VINCE_V5_OBSERVATIONS_INVALID");

  const candidates=registry.discover({capability:cap});
  const byEndpoint=new Map();
  for(const item of observations){
    if(!item||item.format!==ARCA_VINCE_V5_AVAILABILITY_FORMAT)
      throw new Error("ARCA_VINCE_V5_OBSERVATION_INVALID");
    const id=endpointId(item.endpointId);
    if(!STATES.has(item.state))throw new Error("ARCA_VINCE_V5_STATE_INVALID");
    const observed=iso(item.observedAt,"OBSERVED_AT");
    const valid=iso(item.validUntil,"VALID_UNTIL");
    const list=byEndpoint.get(id)??[];
    list.push({item,observedMillis:observed.millis,validMillis:valid.millis});
    byEndpoint.set(id,list);
  }

  const evaluated=candidates.map(descriptor=>{
    const records=(byEndpoint.get(descriptor.endpointId)??[])
      .filter(record=>record.validMillis>=clock.millis)
      .sort((a,b)=>b.observedMillis-a.observedMillis);
    const latestRecord=records[0]??null;
    const eligible=latestRecord&&
      latestRecord.item.state==="AVAILABLE"&&
      latestRecord.item.routeEligible===true&&
      latestRecord.item.wakeAcknowledged===true
      ?latestRecord:null;
    const latest=latestRecord?.item??null;
    return {
      endpointId:descriptor.endpointId,
      participantKind:descriptor.participantKind,
      capabilities:[...descriptor.capabilities],
      eligible:Boolean(eligible),
      eligibleObservedAt:eligible?.item?.observedAt??null,
      latestState:latest?.state??"INCONCLUSIVE",
      latestReason:latest?.reason??"NO_FRESH_OBSERVATION"
    };
  });

  const eligible=evaluated.filter(item=>item.eligible).sort((a,b)=>
    String(b.eligibleObservedAt).localeCompare(String(a.eligibleObservedAt))||
    a.endpointId.localeCompare(b.endpointId)
  );
  const selected=eligible[0]??null;

  return Object.freeze({
    format:ARCA_VINCE_V5_ROUTE_FORMAT,
    version:1,
    capability:cap,
    observedAt:clock.text,
    state:selected?"AVAILABLE":"INCONCLUSIVE",
    selectedEndpointId:selected?.endpointId??null,
    candidateCount:evaluated.length,
    eligibleCount:eligible.length,
    candidates:Object.freeze(evaluated.map(item=>Object.freeze(item))),
    dispatchPerformed:false,
    authority:Object.freeze({
      trustGranted:false,
      codeMutation:false,
      canonicalWrite:false,
      executionAuthority:false
    })
  });
}
