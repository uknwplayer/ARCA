import {canRun,claimExpired} from "./lease.mjs";
import {isMachineBridgeJobV3} from "./protocol-v3.mjs";

function actionCompatible(job,worker,registry){
  const action=registry.get(job?.action);
  if(!action)return false;
  const have=new Set(worker.capabilities||[]);
  return action.requires.every(cap=>have.has(cap));
}

export function canExecuteJob(job,worker,registry){
  return Boolean(isMachineBridgeJobV3(job)&&canRun(job,worker)&&actionCompatible(job,worker,registry));
}

export async function executeClaimedJob({job,worker,claim,registry,now=()=>new Date(),signal}={}){
  if(!canExecuteJob(job,worker,registry))throw new Error("job incompatible");
  if(!claim||claim.jobId!==job.jobId||claim.workerId!==worker.workerId)throw new Error("invalid claim");
  if(claimExpired(claim,now()))throw new Error("claim expired");
  const startedAt=now().toISOString();
  const correlation=typeof job.requestId==="string"?{requestId:job.requestId}:{};
  try{
    const output=await registry.run(job,{worker,signal});
    return {
      format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,...correlation,workerId:worker.workerId,
      attempt:claim.attempt,status:"completed",startedAt,completedAt:now().toISOString(),output:output??null
    };
  }catch(error){
    return {
      format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,...correlation,workerId:worker.workerId,
      attempt:claim.attempt,status:"failed",startedAt,completedAt:now().toISOString(),
      error:{name:error?.name||"Error",message:String(error?.message||error||"unknown error").slice(0,12000)}
    };
  }
}
