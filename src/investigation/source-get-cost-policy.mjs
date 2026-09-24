export const ARCA_GET_COST_POLICY_SCHEMA="arca.get-cost-policy.v1";

export const GET_COST_CLASSES=Object.freeze({
  NO_MONETARY_CHARGE_OBSERVED:"NO_MONETARY_CHARGE_OBSERVED",
  MONETARY_COST:"MONETARY_COST",
  UNKNOWN:"UNKNOWN"
});

export function evaluateGetCostPolicy({
  method="GET",
  costClass,
  evidenceRef=null
}={}){
  if(method!=="GET")throw new Error("ARCA_GET_COST_POLICY_METHOD_NOT_GET");
  if(!Object.values(GET_COST_CLASSES).includes(costClass))
    throw new Error("ARCA_GET_COST_POLICY_CLASS_INVALID");

  if(costClass===GET_COST_CLASSES.NO_MONETARY_CHARGE_OBSERVED){
    return Object.freeze({
      schema:ARCA_GET_COST_POLICY_SCHEMA,
      method:"GET",
      costClass,
      evidenceRef,
      executionState:"AUTO_EXECUTION_ALLOWED",
      humanAuthorizationRequired:false,
      autoExecutionAllowed:true,
      blockedPendingCostClassification:false
    });
  }

  if(costClass===GET_COST_CLASSES.MONETARY_COST){
    return Object.freeze({
      schema:ARCA_GET_COST_POLICY_SCHEMA,
      method:"GET",
      costClass,
      evidenceRef,
      executionState:"AWAITING_HUMAN_COST_AUTHORIZATION",
      humanAuthorizationRequired:true,
      autoExecutionAllowed:false,
      blockedPendingCostClassification:false
    });
  }

  return Object.freeze({
    schema:ARCA_GET_COST_POLICY_SCHEMA,
    method:"GET",
    costClass,
    evidenceRef,
    executionState:"HOLD_FOR_COST_CLASSIFICATION",
    humanAuthorizationRequired:false,
    autoExecutionAllowed:false,
    blockedPendingCostClassification:true
  });
}
