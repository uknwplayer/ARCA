import {ARCA_EVENT_TYPES,createEventFabric} from "./event-fabric.mjs";
import {createFilesystemEventStore} from "./event-filesystem-store.mjs";
import {createEventDeliveryLedger} from "./event-delivery-ledger.mjs";
import {createEventCompletionEvidenceLedger} from "./event-completion-evidence-ledger.mjs";
import {createEventRecoveryView} from "./event-recovery-view.mjs";
import {createPolicyProjectedHandlers} from "./event-agent-handler-projection.mjs";

const EVENT_TYPES=new Set(ARCA_EVENT_TYPES);

export function createEventFabricRuntime({
  root,
  policy,
  agents={},
  eventTypes=ARCA_EVENT_TYPES,
  clock,
  maxPayloadBytes,
  fsImpl
}={}){
  if(!root) throw new Error("ARCA_EVENT_RUNTIME_ROOT_REQUIRED");
  if(!policy?.resolve) throw new Error("ARCA_DISPATCH_POLICY_REQUIRED");
  if(!Array.isArray(eventTypes)) throw new Error("ARCA_EVENT_RUNTIME_EVENT_TYPES_REQUIRED");

  const selected=[...new Set(eventTypes)];
  if(selected.some(type=>!EVENT_TYPES.has(type))) throw new Error("ARCA_EVENT_RUNTIME_EVENT_TYPE_INVALID");

  const store=createFilesystemEventStore({root,fsImpl});
  const deliveryLedger=createEventDeliveryLedger({root,fsImpl,clock});
  const completionEvidence=createEventCompletionEvidenceLedger({root,fsImpl,clock});
  const handlers=createPolicyProjectedHandlers({policy,agents,eventTypes:selected});
  const fabric=createEventFabric({handlers,clock,maxPayloadBytes,store,deliveryLedger});
  const recovery=createEventRecoveryView({deliveryLedger,completionEvidence});

  const ids=Object.freeze(Object.fromEntries(
    selected.map(type=>[type,Object.freeze((handlers[type]??[]).map(handler=>handler.id))])
  ));

  return Object.freeze({
    publish(input){return fabric.publish(input)},
    events(){return fabric.events()},
    handlerIds(type){
      if(!EVENT_TYPES.has(type)) throw new Error("ARCA_EVENT_RUNTIME_EVENT_TYPE_INVALID");
      return ids[type]?.slice()??[];
    },
    recover(eventId,type){
      const handlerIds=ids[type];
      if(!handlerIds) throw new Error("ARCA_EVENT_RUNTIME_EVENT_TYPE_NOT_CONFIGURED");
      if(handlerIds.length===0) return [];
      return recovery.inspect(eventId,handlerIds);
    }
  });
}
