function asDate(value=new Date()){
  if(value instanceof Date)return value;
  if(typeof value==="number")return new Date(value);
  return new Date(value);
}

export function canRun(job,worker){
  if(!job||!worker)return false;
  if(job.workerTarget&&job.workerTarget!=="any"&&job.workerTarget!==worker.workerId)return false;
  const have=new Set(worker.capabilities||[]);
  const requires=Array.isArray(job.requires)?job.requires:[];
  return requires.every(capability=>have.has(capability));
}

export const compatible=canRun;
export const capabilitiesMatch=canRun;

export function claimExpired(claim,now=new Date()){
  if(!claim?.leaseExpiresAt)return true;
  const expires=Date.parse(claim.leaseExpiresAt);
  return !Number.isFinite(expires)||expires<=asDate(now).getTime();
}

export const leaseExpired=claimExpired;

export function makeClaim(job,worker,{now=new Date(),leaseMs=60000,attempt=1}={}){
  if(!canRun(job,worker))throw new Error("worker incompatible");
  if(!Number.isFinite(leaseMs)||leaseMs<=0||leaseMs>300000)throw new Error("invalid lease");
  if(!Number.isInteger(attempt)||attempt<1)throw new Error("invalid attempt");
  const at=asDate(now);
  return {
    format:"arca-claim-v1",
    jobId:job.jobId,
    workerId:worker.workerId,
    claimedAt:at.toISOString(),
    leaseExpiresAt:new Date(at.getTime()+leaseMs).toISOString(),
    attempt
  };
}

export const createClaim=makeClaim;

export function renewClaim(claim,workerOrOptions={},maybeOptions={}){
  let workerId=null;
  let options;
  if(typeof workerOrOptions==="string"){
    workerId=workerOrOptions;
    options=maybeOptions||{};
  }else if(workerOrOptions&&typeof workerOrOptions==="object"&&"workerId" in workerOrOptions&&!("now" in workerOrOptions)&&!("leaseMs" in workerOrOptions)){
    workerId=workerOrOptions.workerId;
    options=maybeOptions||{};
  }else{
    options=workerOrOptions||{};
  }
  if(workerId&&claim?.workerId!==workerId)throw new Error("claim belongs to another worker");
  const now=asDate(options.now??new Date());
  if(claimExpired(claim,now))throw new Error("lease expired");
  const leaseMs=options.leaseMs??60000;
  if(!Number.isFinite(leaseMs)||leaseMs<=0||leaseMs>300000)throw new Error("invalid lease");
  return {...claim,leaseExpiresAt:new Date(now.getTime()+leaseMs).toISOString()};
}
