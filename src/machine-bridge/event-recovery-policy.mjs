const HANDLER=/^[A-Za-z0-9_.:-]{1,128}$/;
const UNCLAIMED=new Set(["first-claim","blocked"]);
const AMBIGUOUS=new Set(["reconcile-only","blocked"]);

function normalizeRule(rule){
  if(!rule||typeof rule!=="object"||Array.isArray(rule)) throw new Error("ARCA_RECOVERY_POLICY_RULE_INVALID");
  const unclaimed=rule.unclaimed??"blocked";
  const claimed=rule.claimed??"blocked";
  const failed=rule.failed??"blocked";
  if(!UNCLAIMED.has(unclaimed)||!AMBIGUOUS.has(claimed)||!AMBIGUOUS.has(failed)){
    throw new Error("ARCA_RECOVERY_POLICY_ACTION_INVALID");
  }
  return Object.freeze({unclaimed,claimed,failed});
}

export function createEventRecoveryPolicy({rules={}}={}){
  if(!rules||typeof rules!=="object"||Array.isArray(rules)) throw new Error("ARCA_RECOVERY_POLICY_RULES_INVALID");
  const table=new Map();
  for(const [handlerId,rule] of Object.entries(rules)){
    if(!HANDLER.test(handlerId)) throw new Error("ARCA_RECOVERY_POLICY_HANDLER_INVALID");
    table.set(handlerId,normalizeRule(rule));
  }

  return Object.freeze({
    decide({handlerId,delivery}={}){
      if(typeof handlerId!=="string"||!HANDLER.test(handlerId)) throw new Error("ARCA_RECOVERY_POLICY_HANDLER_INVALID");
      if(delivery!=null&&(typeof delivery!=="object"||Array.isArray(delivery))) throw new Error("ARCA_RECOVERY_POLICY_DELIVERY_INVALID");
      const rule=table.get(handlerId);
      if(!rule){
        if(delivery?.status==="acked") return Object.freeze({action:"complete",reason:"already-acked"});
        return Object.freeze({action:"blocked",reason:"no-explicit-rule"});
      }
      if(!delivery) return Object.freeze({
        action:rule.unclaimed,
        reason:rule.unclaimed==="first-claim"?"explicit-first-claim-rule":"first-claim-not-authorized"
      });
      if(delivery.status==="acked") return Object.freeze({action:"complete",reason:"already-acked"});
      if(delivery.status==="claimed") return Object.freeze({
        action:rule.claimed,
        reason:rule.claimed==="reconcile-only"?"claimed-outcome-ambiguous":"claimed-recovery-blocked"
      });
      if(delivery.status==="failed") return Object.freeze({
        action:rule.failed,
        reason:rule.failed==="reconcile-only"?"failed-outcome-ambiguous":"failed-recovery-blocked"
      });
      return Object.freeze({action:"blocked",reason:"unknown-delivery-state"});
    },
    rule(handlerId){
      if(typeof handlerId!=="string"||!HANDLER.test(handlerId)) throw new Error("ARCA_RECOVERY_POLICY_HANDLER_INVALID");
      return table.get(handlerId)??null;
    }
  });
}
