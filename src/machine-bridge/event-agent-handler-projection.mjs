export function projectAgentHandlers({policy,agents={}}={}){
  if(!policy?.resolve) throw new Error("ARCA_DISPATCH_POLICY_REQUIRED");
  return event=>policy.resolve(event).map(agentId=>{
    const handle=agents[agentId];
    if(typeof handle!=="function") return {id:`agent:${agentId}`,agentId,status:"unavailable"};
    return {id:`agent:${agentId}`,agentId,status:"ready",handle};
  });
}

export function createPolicyProjectedHandlers({policy,agents={},eventTypes=[]}={}){
  const project=projectAgentHandlers({policy,agents});
  const handlers={};
  for(const type of eventTypes){
    const projected=project({type});
    handlers[type]=projected.filter(x=>x.status==="ready").map(({id,handle})=>Object.freeze({id,handle}));
  }
  return Object.freeze(handlers);
}
