import http from "node:http";

const id=String(process.env.ARCA_TEST_AGENT_ID??"live-aap-agent");
const provider=String(process.env.ARCA_TEST_AGENT_PROVIDER??"live-test");
const failAfterJobs=Number(process.env.ARCA_TEST_AGENT_FAIL_AFTER_JOBS??"-1");
const capabilities=["research"];
let jobCalls=0;

function json(response,status,value){
  const body=JSON.stringify(value);
  response.writeHead(status,{"content-type":"application/json","content-length":Buffer.byteLength(body)});
  response.end(body);
}
async function readBody(request){
  const chunks=[];
  let bytes=0;
  for await(const chunk of request){
    bytes+=chunk.length;
    if(bytes>128*1024)throw new Error("request too large");
    chunks.push(chunk);
  }
  return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):null;
}

const server=http.createServer(async(request,response)=>{
  try{
    if(request.method==="GET"&&request.url==="/arca/agent"){
      json(response,200,{
        format:"arca-agent-descriptor-v1",
        id,
        name:id,
        provider,
        capabilities
      });
      return;
    }
    if(request.method==="GET"&&request.url==="/test/stats"){
      json(response,200,{id,pid:process.pid,jobCalls});
      return;
    }
    if(request.method==="POST"&&request.url==="/arca/jobs"){
      jobCalls+=1;
      const task=await readBody(request);
      if(Number.isFinite(failAfterJobs)&&failAfterJobs>=0&&jobCalls>failAfterJobs){
        json(response,503,{error:"synthetic-runtime-unavailable",id,jobCalls});
        return;
      }
      json(response,200,{
        format:"arca-agent-result-v1",
        taskId:task?.taskId,
        status:"completed",
        output:{
          requestId:task?.context?.requestId??task?.taskId,
          status:"completed",
          agentId:id,
          runtimePid:process.pid,
          runtimeKind:"child-process-aap"
        },
        humanReviewRequired:true
      });
      return;
    }
    json(response,404,{error:"not-found"});
  }catch(error){
    json(response,500,{error:String(error?.message??error)});
  }
});

server.listen(0,"127.0.0.1",()=>{
  const address=server.address();
  process.stdout.write(JSON.stringify({ready:true,id,pid:process.pid,port:address.port})+"\n");
});

function shutdown(){
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(1),2000).unref();
}
process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
