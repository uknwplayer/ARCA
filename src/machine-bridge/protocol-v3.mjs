const SAFE_NAME=/^[A-Za-z0-9._-]{1,120}$/;
const SAFE_ACTION=/^[A-Za-z0-9._-]{1,80}$/;

export function isMachineBridgeJobV3(job){
  if(!job||typeof job!=="object"||Array.isArray(job))return false;
  if(job.format!=="arca-remote-job-v3"||job.protocolVersion!==3)return false;
  if(!SAFE_NAME.test(job.jobId||"")||!SAFE_ACTION.test(job.action||""))return false;
  if(job.requestId!==undefined&&!SAFE_NAME.test(job.requestId||""))return false;
  if(!Array.isArray(job.requires)||job.requires.some(x=>typeof x!=="string"||!x.trim()))return false;
  if(new Set(job.requires).size!==job.requires.length)return false;
  if(job.workerTarget!==undefined&&job.workerTarget!=="any"&&!SAFE_NAME.test(job.workerTarget))return false;
  if(job.params!==undefined&&(!job.params||typeof job.params!=="object"||Array.isArray(job.params)))return false;
  if(job.timeoutMs!==undefined&&(!Number.isInteger(job.timeoutMs)||job.timeoutMs<1000||job.timeoutMs>300000))return false;
  return true;
}

export function assertMachineBridgeJobV3(job){if(!isMachineBridgeJobV3(job))throw new Error("invalid Machine Bridge V3 job");return job}
