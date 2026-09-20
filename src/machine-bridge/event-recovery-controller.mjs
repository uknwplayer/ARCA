export function createEventRecoveryController({store,deliveryLedger,handlers={},recoveryPolicy=null}={}){
  if(!store?.read) throw new Error("ARCA_RECOVERY_STORE_REQUIRED");
  if(!deliveryLedger?.get||!deliveryLedger?.claim||!deliveryLedger?.ack||!deliveryLedger?.fail) throw new Error("ARCA_RECOVERY_LEDGER_REQUIRED");
  if(recoveryPolicy!=null&&typeof recoveryPolicy?.decide!=="function") throw new Error("ARCA_RECOVERY_POLICY_INVALID");

  const decision=(handlerId,delivery)=>{
    if(recoveryPolicy) return recoveryPolicy.decide({handlerId,delivery});
    if(!delivery) return {action:"first-claim",reason:"legacy-first-claim"};
    if(delivery.status==="acked") return {action:"complete",reason:"already-acked"};
    return {action:"blocked",reason:"ambiguous-delivery"};
  };

  return Object.freeze({
    async recover(eventId){
      const event=store.read(eventId);
      if(!event) throw new Error("ARCA_RECOVERY_EVENT_MISSING");
      if(event.eventId!==eventId||typeof event.type!=="string") throw new Error("ARCA_RECOVERY_EVENT_INVALID");

      const configured=handlers[event.type]??[];
      const results=[];

      for(let i=0;i<configured.length;i++){
        const entry=configured[i];
        const handle=typeof entry==="function"?entry:entry.handle;
        const handlerId=typeof entry==="function"?`${event.type}:${i}`:entry.id;
        if(typeof handle!=="function"||typeof handlerId!=="string"||!handlerId) throw new Error("ARCA_RECOVERY_HANDLER_INVALID");

        const existing=deliveryLedger.get(eventId,handlerId);
        const recoveryDecision=decision(handlerId,existing);

        if(existing){
          if(existing.status==="acked"){
            results.push({handlerId,status:"already-acked",recoveryAction:recoveryDecision.action});
          }else{
            results.push({
              handlerId,
              status:"uncertain",
              deliveryStatus:existing.status,
              recoveryAction:recoveryDecision.action,
              recoveryReason:recoveryDecision.reason
            });
          }
          continue;
        }

        if(recoveryDecision.action!=="first-claim"){
          results.push({
            handlerId,
            status:"blocked",
            deliveryStatus:"unclaimed",
            recoveryAction:recoveryDecision.action,
            recoveryReason:recoveryDecision.reason
          });
          continue;
        }

        const claim=deliveryLedger.claim(eventId,handlerId);
        if(claim.status==="acked"){
          results.push({handlerId,status:"already-acked",recoveryAction:"complete"});
          continue;
        }
        if(claim.status!=="claimed"||claim.acquired!==true){
          results.push({handlerId,status:"uncertain",deliveryStatus:claim.status,recoveryAction:"blocked",recoveryReason:"claim-not-acquired"});
          continue;
        }

        try{
          const value=await handle(event);
          deliveryLedger.ack(eventId,handlerId);
          results.push({handlerId,status:"fulfilled",value,recoveryAction:"first-claim"});
        }catch(error){
          const errorCode=error?.code??error?.message??"ARCA_EVENT_HANDLER_FAILED";
          deliveryLedger.fail(eventId,handlerId,errorCode);
          results.push({handlerId,status:"rejected",errorCode,recoveryAction:"first-claim"});
        }
      }

      return {eventId,status:"recovered",results};
    }
  });
}
