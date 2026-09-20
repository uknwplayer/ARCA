export function readProviderConfig(env=process.env){
 const providers=[];
 for(const [id,prefix] of [["openai","OPENAI"],["anthropic","ANTHROPIC"],["gemini","GEMINI"],["meta","META"],["grok","GROK"]]){
  const key=env["ARCA_"+prefix+"_API_KEY"],model=env["ARCA_"+prefix+"_MODEL"];
  if(key&&model)providers.push(Object.freeze({id,model,apiKey:key}));
 }
 return providers;
}
export function publicProviderConfig(configs){return configs.map(({id,model})=>({id,model}));}
