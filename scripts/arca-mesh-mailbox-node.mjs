#!/usr/bin/env node
import {hostname} from "node:os";
import {GitHubMachineBridgeTransport} from "../src/machine-bridge/github-transport.mjs";
import {GitHubMeshMailboxTransport} from "../src/machine-bridge/github-mesh-mailbox.mjs";
import {MachineBridgeMeshEndpoint,MachineBridgeMeshRelay} from "../src/machine-bridge/mesh.mjs";
import {MachineBridgeRemoteClient} from "../src/machine-bridge/remote-client.mjs";

function required(value,label){const text=String(value||"").trim();if(!text)throw new Error(`${label} required`);return text}
function list(value){return [...new Set(String(value||"").split(",").map(item=>item.trim()).filter(Boolean))].sort()}

const repository=required(process.env.ARCA_GITHUB_REPOSITORY||process.env.GITHUB_REPOSITORY,"ARCA_GITHUB_REPOSITORY");
const token=required(process.env.ARCA_GITHUB_TOKEN||process.env.GITHUB_TOKEN,"ARCA_GITHUB_TOKEN");
const ref=process.env.ARCA_GITHUB_REF||"arca-runtime";
const nodeId=required(process.env.ARCA_MESH_NODE_ID,"ARCA_MESH_NODE_ID");
const requestId=String(process.env.ARCA_MESH_REQUEST_ID||"").trim()||null;
const mode=String(process.env.ARCA_MESH_NODE_MODE||"relay").trim().toLowerCase();
const processorId=String(process.env.ARCA_MESH_PROCESSOR_ID||`${nodeId}-${hostname()}`).replace(/[^A-Za-z0-9._-]/g,"-").slice(0,120);
const mailbox=new GitHubMeshMailboxTransport({repository,ref,token});

const queued=await mailbox.listEnvelopes(nodeId);
const selected=requestId?queued.find(item=>item.envelope.requestId===requestId):queued[0];
if(!selected){console.log(`[ARCA Mesh] no envelope for ${nodeId}${requestId?` request=${requestId}`:""}`);process.exit(0)}
if(await mailbox.getResult(selected.envelope.requestId)){console.log(`[ARCA Mesh] result already exists request=${selected.envelope.requestId}`);process.exit(0)}
const claim=await mailbox.claimEnvelope(nodeId,selected.envelope.requestId,processorId,{leaseMs:10*60*1000});
if(!claim){console.log(`[ARCA Mesh] envelope already claimed request=${selected.envelope.requestId}`);process.exit(0)}

let result;
if(mode==="relay"){
  const nextNode=required(process.env.ARCA_MESH_NEXT_NODE,"ARCA_MESH_NEXT_NODE");
  const reachable=list(process.env.ARCA_MESH_NEXT_REACHABLE_CAPABILITIES);
  if(!reachable.length)throw new Error("ARCA_MESH_NEXT_REACHABLE_CAPABILITIES required for relay mode");
  await mailbox.registerNode({
    nodeId,kind:"relay",capabilities:["mesh.relay"],reachableCapabilities:reachable,
    metadata:{runtime:"github-actions-mailbox-v0",nextNode}
  });
  const relay=new MachineBridgeMeshRelay({nodeId});
  relay.addPeer(mailbox.remotePeer(nextNode,{reachableCapabilities:reachable,waitTimeoutMs:8*60*1000,pollIntervalMs:1000}));
  result=await relay.forward(selected.envelope);
}else if(mode==="gateway"){
  const endpointNodeId=required(process.env.ARCA_MESH_ENDPOINT_NODE_ID,"ARCA_MESH_ENDPOINT_NODE_ID");
  const endpointCapabilities=list(process.env.ARCA_MESH_ENDPOINT_CAPABILITIES);
  if(!endpointCapabilities.length)throw new Error("ARCA_MESH_ENDPOINT_CAPABILITIES required for gateway mode");
  await mailbox.registerNode({
    nodeId,kind:"hybrid",capabilities:["mesh.relay"],reachableCapabilities:endpointCapabilities,
    metadata:{runtime:"github-actions-mailbox-v0",endpointNodeId}
  });
  const jobTransport=new GitHubMachineBridgeTransport({repository,ref,token});
  const directClient=new MachineBridgeRemoteClient({transport:jobTransport});
  const endpoint=new MachineBridgeMeshEndpoint({nodeId:endpointNodeId,capabilities:endpointCapabilities,client:directClient});
  const relay=new MachineBridgeMeshRelay({nodeId,peers:[endpoint.advertise()]});
  result=await relay.forward(selected.envelope);
}else{
  throw new Error(`unsupported ARCA_MESH_NODE_MODE: ${mode}`);
}

const stored=await mailbox.writeResult(result);
console.log(JSON.stringify({
  ok:true,nodeId,mode,requestId:selected.envelope.requestId,jobId:selected.envelope.job.jobId,
  route:result.route,replyRoute:result.replyRoute,resultStatus:result.result?.status,stored
},null,2));
