export function createToolEnabledAuditorAdapter({agentId,provider,model,reason,tools,maxToolCalls=8}){
 if(!agentId||!provider||!model||typeof reason!=="function"||!tools) throw new Error("ARCA_MBDP_TOOL_AGENT_INVALID_CONFIG");
 return Object.freeze({agentId,provider,model,async analyze(input){
  let transcript=[], calls=0;
  while(true){
   const step=await reason({input,transcript:Object.freeze([...transcript]),availableTools:Object.keys(tools)});
   if(!step||typeof step!=="object") throw new Error("ARCA_MBDP_TOOL_AGENT_INVALID_STEP");
   if(step.kind==="final"){
    if(typeof step.body!=="string"||!step.body.trim()) throw new Error("ARCA_MBDP_TOOL_AGENT_INVALID_FINAL");
    return {type:step.type??"analysis",body:step.body,evidenceRefs:step.evidenceRefs??[]};
   }
   if(step.kind!=="tool") throw new Error("ARCA_MBDP_TOOL_AGENT_UNKNOWN_STEP");
   if(++calls>maxToolCalls) throw new Error("ARCA_MBDP_TOOL_AGENT_BUDGET_EXCEEDED");
   const tool=tools[step.name]; if(!tool?.readOnly||typeof tool.invoke!=="function") throw new Error("ARCA_MBDP_TOOL_AGENT_TOOL_DENIED");
   const result=await tool.invoke(step.args??{});
   transcript.push(Object.freeze({kind:"tool-result",name:step.name,result}));
  }
 }});
}
