import {mkdir,readdir,readFile,open,rm,rename,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {claimExpired,makeClaim,renewClaim} from "./lease.mjs";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;

async function readJson(path){return JSON.parse(await readFile(path,"utf8"))}
async function atomicJson(path,value){
  const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp,JSON.stringify(value,null,2)+"\n");
  await rename(tmp,path);
}

export class FsMachineBridgeTransport{
  constructor(root){this.root=root}

  async init(workerId){
    if(!SAFE_ID.test(workerId))throw new Error("invalid worker id");
    for(const dir of ["queues/shared",`queues/${workerId}`,"claims","results"]){await mkdir(join(this.root,dir),{recursive:true})}
  }

  async listJobs(workerId){
    await this.init(workerId);
    const dirs=[join(this.root,"queues",workerId),join(this.root,"queues","shared")];
    const jobs=[];
    for(const dir of dirs){
      for(const name of (await readdir(dir)).filter(x=>x.endsWith(".json")).sort()){
        const path=join(dir,name);
        try{jobs.push({path,job:await readJson(path)})}catch{}
      }
    }
    return jobs;
  }

  async listResults(){
    const dir=join(this.root,"results");
    await mkdir(dir,{recursive:true});
    const results=[];
    for(const name of (await readdir(dir)).filter(x=>x.endsWith(".json")).sort()){
      const path=join(dir,name);
      try{results.push({path,result:await readJson(path)})}catch{}
    }
    return results;
  }

  resultPath(jobId){
    if(!SAFE_ID.test(jobId))throw new Error("invalid job id");
    return join(this.root,"results",`${jobId}.json`);
  }

  claimPath(jobId){
    if(!SAFE_ID.test(jobId))throw new Error("invalid job id");
    return join(this.root,"claims",`${jobId}.json`);
  }

  async getResult(jobId){
    const path=this.resultPath(jobId);
    try{return {path,result:await readJson(path)}}catch(e){if(e.code==="ENOENT")return null;throw e}
  }

  async hasResult(jobId){return Boolean(await this.getResult(jobId))}

  async claim(job,worker,{leaseMs,now=new Date()}={}){
    const path=this.claimPath(job.jobId);
    let attempt=1;
    try{
      const current=await readJson(path);
      if(!claimExpired(current,now))return null;
      attempt=(Number(current.attempt)||0)+1;
      await rm(path,{force:true});
    }catch(e){if(e.code!=="ENOENT")throw e}
    const claim=makeClaim(job,worker,{attempt,leaseMs,now});
    try{
      const handle=await open(path,"wx");
      try{await handle.writeFile(JSON.stringify(claim,null,2)+"\n")}finally{await handle.close()}
      return claim;
    }catch(e){if(e.code==="EEXIST")return null;throw e}
  }

  async renew(jobId,workerId,{leaseMs,now=new Date()}={}){
    const path=this.claimPath(jobId);
    const current=await readJson(path);
    if(current.workerId!==workerId)throw new Error("claim belongs to another worker");
    const renewed=renewClaim(current,{leaseMs,now});
    await atomicJson(path,renewed);
    return renewed;
  }

  async writeResult(result){
    const path=this.resultPath(result.jobId);
    try{
      const handle=await open(path,"wx");
      try{await handle.writeFile(JSON.stringify(result,null,2)+"\n")}finally{await handle.close()}
      return true;
    }catch(e){if(e.code==="EEXIST")return false;throw e}
  }
}
