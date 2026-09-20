import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {FederationPeerCatalog} from "../src/machine-bridge/federation-peer-catalog.mjs";
import {GitHubMeshMailboxTransport} from "../src/machine-bridge/github-mesh-mailbox.mjs";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";

const T1=new Date("2026-09-18T03:00:00.000Z");
const T2=new Date("2026-09-18T03:01:00.000Z");

async function withCatalog(fn){
  const root=await mkdtemp(join(tmpdir(),"arca-federation-catalog-"));
  try{
    const catalog=await new FederationPeerCatalog({root}).init();
    await fn({catalog,root});
  }finally{await rm(root,{recursive:true,force:true})}
}

function recordInput(identity){
  return {
    peerId:"peer-b",
    nodeId:"worker-b",
    transport:{
      kind:"github-mailbox",
      repository:"operator-b/mesh-state",
      ref:"arca-runtime",
      root:"remote-mesh"
    },
    identity:{
      nodeId:"worker-b",
      identityId:identity.identityId,
      keyFingerprint:identity.keyFingerprint
    },
    now:T1
  };
}

function makeRepoApi(repository,token){
  const store=new Map();let seq=0;
  const response=(status,body)=>({
    ok:status>=200&&status<300,status,statusText:String(status),
    async text(){return body==null?"":JSON.stringify(body)}
  });
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url);
    if(options.headers?.Authorization!==`Bearer ${token}`)return response(401,{message:"bad token"});
    if(!u.pathname.startsWith(`/repos/${repository}/`))return response(404,{message:"wrong repository"});
    const method=options.method||"GET";
    if(method==="POST"&&u.pathname.endsWith("/dispatches"))return response(204,null);
    const marker="/contents/";const index=u.pathname.indexOf(marker);
    if(index<0)return response(404,{message:"Not Found"});
    const raw=u.pathname.slice(index+marker.length);
    const path=raw.split("/").map(decodeURIComponent).join("/");
    if(method==="PUT"){
      const body=JSON.parse(options.body);const current=store.get(path);
      if(current&&body.sha!==current.sha)return response(409,{message:"sha mismatch"});
      if(!current&&body.sha)return response(409,{message:"missing path"});
      const text=Buffer.from(body.content,"base64").toString("utf8");
      store.set(path,{text,sha:`sha-${++seq}`});
      return response(201,{content:{path,sha:store.get(path).sha}});
    }
    const file=store.get(path);
    if(file)return response(200,{type:"file",name:path.split("/").at(-1),path,sha:file.sha,content:Buffer.from(file.text).toString("base64")});
    const prefix=path.replace(/\/$/,"")+"/";const children=new Map();
    for(const [key,value] of store){
      if(!key.startsWith(prefix))continue;
      const rest=key.slice(prefix.length);const name=rest.split("/")[0];if(!name)continue;
      const childPath=prefix+name;
      if(!children.has(name))children.set(name,rest.includes("/")
        ?{type:"dir",name,path:childPath}
        :{type:"file",name,path:childPath,sha:value.sha});
    }
    return children.size?response(200,[...children.values()]):response(404,{message:"Not Found"});
  };
  return {store,fetchImpl};
}

test("Federation peer catalog persists only non-secret trust bindings and is idempotent through reads",async()=>{
  const identity=generateMeshNodeIdentity("worker-b").identity;
  await withCatalog(async({catalog,root})=>{
    const record=await catalog.enroll(recordInput(identity));
    assert.equal(record.status,"active");
    assert.equal(record.revision,1);
    assert.equal(record.identity.keyFingerprint,identity.keyFingerprint);

    const loaded=await catalog.get("peer-b");
    assert.deepEqual(loaded,record);
    const listed=await catalog.list();
    assert.deepEqual(listed,[record]);

    const raw=await readFile(join(root,"peer-b.json"),"utf8");
    assert.equal(raw.includes("token"),false);
    assert.equal(raw.includes("password"),false);
    assert.equal(raw.includes("privateKey"),false);
  });
});

test("Federation peer catalog disable/enable are explicit durable state transitions",async()=>{
  const identity=generateMeshNodeIdentity("worker-b").identity;
  await withCatalog(async({catalog})=>{
    await catalog.enroll(recordInput(identity));
    const disabled=await catalog.disable("peer-b",{now:T2});
    assert.equal(disabled.status,"disabled");
    assert.equal(disabled.revision,2);
    assert.deepEqual(await catalog.list(),[]);
    assert.equal((await catalog.list({includeDisabled:true}))[0].status,"disabled");

    const enabled=await catalog.enable("peer-b",{now:new Date(T2.getTime()+1000)});
    assert.equal(enabled.status,"active");
    assert.equal(enabled.revision,3);
  });
});

test("Federation identity rotation requires the exact currently pinned fingerprint",async()=>{
  const first=generateMeshNodeIdentity("worker-b").identity;
  const second=generateMeshNodeIdentity("worker-b").identity;
  await withCatalog(async({catalog})=>{
    await catalog.enroll(recordInput(first));
    await assert.rejects(()=>catalog.rotateIdentity("peer-b",{
      nodeId:"worker-b",identityId:second.identityId,keyFingerprint:second.keyFingerprint
    },{expectedCurrentFingerprint:"0".repeat(64),now:T2}),/rotation fingerprint mismatch/);

    const rotated=await catalog.rotateIdentity("peer-b",{
      nodeId:"worker-b",identityId:second.identityId,keyFingerprint:second.keyFingerprint
    },{expectedCurrentFingerprint:first.keyFingerprint,now:T2});
    assert.equal(rotated.identity.keyFingerprint,second.keyFingerprint);
    assert.equal(rotated.revision,2);
  });
});

test("Federation peer catalog detects record tampering",async()=>{
  const identity=generateMeshNodeIdentity("worker-b").identity;
  await withCatalog(async({catalog,root})=>{
    await catalog.enroll(recordInput(identity));
    const path=join(root,"peer-b.json");
    const value=JSON.parse(await readFile(path,"utf8"));
    value.transport.repository="attacker/other";
    await writeFile(path,JSON.stringify(value,null,2)+"\n");
    await assert.rejects(()=>catalog.get("peer-b"),/record hash mismatch/);
  });
});

test("Federation catalog resolves only the catalog-pinned repository and identity",async()=>{
  const signer=generateMeshNodeIdentity("worker-b");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  const api=makeRepoApi("operator-b/mesh-state","token-b");
  const mailbox=new GitHubMeshMailboxTransport({
    repository:"operator-b/mesh-state",
    ref:"arca-runtime",
    token:"token-b",
    fetchImpl:api.fetchImpl,
    identityPolicy:"require-trusted",
    trustStore
  });
  await mailbox.registerSignedNode({
    nodeId:"worker-b",
    kind:"endpoint",
    capabilities:["reasoning"],
    reachableCapabilities:["reasoning"],
    heartbeatAt:T1.toISOString()
  },{signer,now:T1,ttlMs:120000,clockSkewMs:0});

  await withCatalog(async({catalog})=>{
    await catalog.enroll(recordInput(signer.identity));
    const peer=await catalog.resolve("peer-b",{
      mailbox,
      trustStore,
      resolverOptions:{now:()=>new Date(T2),maxAgeMs:120000,clockSkewMs:0}
    });
    assert.equal(peer.nodeId,"worker-b");
    assert.equal(peer.federation.transport.repository,"operator-b/mesh-state");
    assert.equal(peer.federation.identity.keyFingerprint,signer.identity.keyFingerprint);

    const wrongApi=makeRepoApi("operator-c/mesh-state","token-c");
    const wrongMailbox=new GitHubMeshMailboxTransport({
      repository:"operator-c/mesh-state",
      ref:"arca-runtime",
      token:"token-c",
      fetchImpl:wrongApi.fetchImpl,
      identityPolicy:"require-trusted",
      trustStore
    });
    await assert.rejects(()=>catalog.resolve("peer-b",{
      mailbox:wrongMailbox,
      trustStore,
      resolverOptions:{now:()=>new Date(T2),maxAgeMs:120000,clockSkewMs:0},
      peerOptions:{expectedKeyFingerprint:"f".repeat(64)}
    }),/catalog transport mismatch/);
  });
});

test("Federation catalog refuses to resolve disabled peers",async()=>{
  const signer=generateMeshNodeIdentity("worker-b");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  const api=makeRepoApi("operator-b/mesh-state","token-b");
  const mailbox=new GitHubMeshMailboxTransport({
    repository:"operator-b/mesh-state",ref:"arca-runtime",token:"token-b",fetchImpl:api.fetchImpl,
    identityPolicy:"require-trusted",trustStore
  });

  await withCatalog(async({catalog})=>{
    await catalog.enroll(recordInput(signer.identity));
    await catalog.disable("peer-b",{now:T2});
    await assert.rejects(()=>catalog.resolve("peer-b",{mailbox,trustStore}),/federation peer disabled/);
  });
});
