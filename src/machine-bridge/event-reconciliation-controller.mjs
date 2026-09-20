const HASH=/^[0-9a-f]{64}$/;
const SAFE=/^[A-Za-z0-9_.:-]{1,128}$/;

function validateEvidence(value,eventId,handlerId){
  if(!value||typeof value!=="object"||Array.isArray(value)) throw new Error("ARCA_RECONCILIATION_EVIDENCE_INVALID");
  if(value.eventId!==eventId||value.handlerId!==handlerId) throw new Error("ARCA_RECONCILIATION_EVIDENCE_CORRELATION_MISMATCH");
  if(!HASH.test(value.resultHash)||!HASH.test(value.evidenceHash)) throw new Error("ARCA_RECONCILIATION_EVIDENCE_HASH_INVALID");
  if(!SAFE.test(value.sourceId)) throw new Error("ARCA_RECONCILIATION_EVIDENCE_SOURCE_INVALID");
  return value;
}

export function createEventReconciliationController({
  store,
  deliveryLedger,
  evidenceLedger,
  recoveryPolicy,
  completionSource
}={}){
  if(!store?.read) throw new Error("ARCA_RECONCILIATION_STORE_REQUIRED");
  if(!deliveryLedger?.get) throw new Error("ARCA_RECONCILIATION_DELIVERY_LEDGER_REQUIRED");
  if(!evidenceLedger?.get||!evidenceLedger?.record) throw new Error("ARCA_RECONCILIATION_EVIDENCE_LEDGER_REQUIRED");
  if(typeof recoveryPolicy?.decide!=="function") throw new Error("ARCA_RECONCILIATION_POLICY_REQUIRED");
  if(typeof completionSource?.lookupVerified!=="function") throw new Error("ARCA_RECONCILIATION_SOURCE_REQUIRED");

  return Object.freeze({
    async reconcile(eventId,handlerId){
      if(typeof eventId!=="string"||typeof handlerId!=="string") throw new Error("ARCA_RECONCILIATION_KEY_INVALID");
      const event=store.read(eventId);
      if(!event) throw new Error("ARCA_RECONCILIATION_EVENT_MISSING");
      if(event.eventId!==eventId) throw new Error("ARCA_RECONCILIATION_EVENT_INVALID");

      const delivery=deliveryLedger.get(eventId,handlerId);
      if(!delivery){
        return Object.freeze({eventId,handlerId,status:"blocked",reason:"no-delivery"});
      }
      if(delivery.status==="acked"){
        return Object.freeze({eventId,handlerId,status:"already-acked"});
      }

      const policy=recoveryPolicy.decide({handlerId,delivery});
      if(policy.action!=="reconcile-only"){
        return Object.freeze({
          eventId,
          handlerId,
          status:"blocked",
          reason:policy.reason,
          recoveryAction:policy.action
        });
      }

      const prior=evidenceLedger.get(eventId,handlerId);
      if(prior){
        return Object.freeze({
          eventId,
          handlerId,
          status:"completed-evidenced",
          resultHash:prior.resultHash,
          evidenceHash:prior.evidenceHash,
          sourceId:prior.sourceId,
          created:false
        });
      }

      const observed=await completionSource.lookupVerified(Object.freeze({
        event,
        handlerId,
        delivery:Object.freeze({...delivery})
      }));

      if(observed==null){
        return Object.freeze({
          eventId,
          handlerId,
          status:"unresolved",
          recoveryAction:"reconcile-only"
        });
      }

      const evidence=validateEvidence(observed,eventId,handlerId);
      const recorded=evidenceLedger.record({
        eventId,
        handlerId,
        resultHash:evidence.resultHash,
        evidenceHash:evidence.evidenceHash,
        sourceId:evidence.sourceId,
        observedAt:evidence.observedAt
      });

      return Object.freeze({
        eventId,
        handlerId,
        status:"completed-evidenced",
        resultHash:recorded.evidence.resultHash,
        evidenceHash:recorded.evidence.evidenceHash,
        sourceId:recorded.evidence.sourceId,
        created:recorded.created
      });
    }
  });
}
