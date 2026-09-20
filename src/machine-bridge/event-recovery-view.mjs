export function createEventRecoveryView({deliveryLedger,completionEvidence=null}={}){
  if(!deliveryLedger?.get) throw new Error("ARCA_RECOVERY_LEDGER_REQUIRED");
  if(completionEvidence!=null&&typeof completionEvidence?.get!=="function") throw new Error("ARCA_RECOVERY_COMPLETION_EVIDENCE_INVALID");
  return Object.freeze({
    inspect(eventId,handlerIds){
      if(!Array.isArray(handlerIds)||handlerIds.length===0) throw new Error("ARCA_RECOVERY_HANDLERS_REQUIRED");
      return handlerIds.map(handlerId=>{
        const d=deliveryLedger.get(eventId,handlerId);
        const evidence=completionEvidence?.get(eventId,handlerId)??null;
        if(evidence&&!d){
          return {
            eventId,
            handlerId,
            state:"evidence-conflict",
            action:"fail-closed",
            reason:"completion-evidence-without-delivery"
          };
        }
        if(!d) return {eventId,handlerId,state:"unclaimed",action:"eligible-for-first-claim"};
        if(d.status==="acked") return {eventId,handlerId,state:"completed",action:"none"};
        if(evidence&&(d.status==="claimed"||d.status==="failed")){
          return {
            eventId,
            handlerId,
            state:"completed-evidenced",
            action:"none",
            resultHash:evidence.resultHash,
            evidenceHash:evidence.evidenceHash,
            sourceId:evidence.sourceId
          };
        }
        if(d.status==="claimed") return {eventId,handlerId,state:"uncertain",action:"human-or-policy-review"};
        if(d.status==="failed") return {eventId,handlerId,state:"failed-uncertain",action:"human-or-idempotency-policy-review",errorCode:d.errorCode??null};
        return {eventId,handlerId,state:"unknown",action:"fail-closed"};
      });
    }
  });
}
