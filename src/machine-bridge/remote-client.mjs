import {assertMachineBridgeJobV3} from "./protocol-v3.mjs";

function defaultSleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

export class MachineBridgeRemoteClient{
  constructor({transport,sleepImpl=defaultSleep,now=Date.now}={}){
    if(!transport||typeof transport.enqueue!=="function"||typeof transport.getResult!=="function")throw new Error("transport with enqueue/getResult required");
    if(typeof sleepImpl!=="function"||typeof now!=="function")throw new Error("invalid remote client clock");
    this.transport=transport;this.sleep=sleepImpl;this.now=now;
  }

  async submit(job,{queue="shared",notify=true}={}){
    assertMachineBridgeJobV3(job);
    const stored=await this.transport.enqueue(job,{queue,notify});
    if(!stored)throw new Error(`job already exists: ${job.jobId}`);
    return {jobId:job.jobId,requestId:job.requestId??null,queue};
  }

  async waitForResult(job,{waitTimeoutMs=180000,pollIntervalMs=1000}={}){
    assertMachineBridgeJobV3(job);
    if(!Number.isInteger(waitTimeoutMs)||waitTimeoutMs<1000||waitTimeoutMs>900000)throw new Error("invalid wait timeout");
    if(!Number.isInteger(pollIntervalMs)||pollIntervalMs<100||pollIntervalMs>30000)throw new Error("invalid poll interval");
    const deadline=this.now()+waitTimeoutMs;
    for(;;){
      const loaded=await this.transport.getResult(job.jobId);
      if(loaded){
        const result=loaded.result;
        if(!result||result.jobId!==job.jobId)throw new Error("result job correlation mismatch");
        if(job.requestId!==undefined&&result.requestId!==job.requestId)throw new Error("result request correlation mismatch");
        return result;
      }
      if(this.now()>=deadline)throw new Error(`timed out waiting for result: ${job.jobId}`);
      await this.sleep(pollIntervalMs);
    }
  }

  async call(job,{queue="shared",notify=true,waitTimeoutMs=180000,pollIntervalMs=1000}={}){
    await this.submit(job,{queue,notify});
    return this.waitForResult(job,{waitTimeoutMs,pollIntervalMs});
  }
}
