import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,stat,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";

import {
  buildSignedTermuxV41Result,
  initTermuxV41Identity,
  inspectGitStatus,
  loadTermuxV41Identity,
  publishTermuxV41Identity,
  runTermuxV41OneShot
} from "../src/machine-bridge/vince-v4-1-termux-worker.mjs";
import {
  verifyV41AttestedResult
} from "../src/machine-bridge/vince-v4-1-attestation.mjs";

const T0=new Date("2026-09-23T12:00:00.000Z");
const T1=new Date("2026-09-23T12:00:01.000Z");
const CHALLENGE=Buffer.alloc(32,9).toString("base64url");

async function withTemp(fn){
  const root=await mkdtemp(join(tmpdir(),"arca-v41-termux-"));
  try{return await fn(root)}
  finally{await rm(root,{recursive:true,force:true})}
}
function request(jobId="vince-v41-termux-test-001"){
  return {
    format:"arca-vince-v4.1-job",
    protocolVersion:"4.1",
    jobId,
    action:"git-status",
    expiresAt:"2026-09-23T13:00:00.000Z",
    challenge:CHALLENGE
  };
}
function git(command,args,cwd){
  const out=spawnSync(command,args,{cwd,encoding:"utf8",shell:false});
  if(out.error||out.status!==0)throw new Error(String(out.stderr||out.error?.message));
  return out.stdout;
}
async function makeGitRepo(root){
  const repo=join(root,"repo");
  await import("node:fs/promises").then(({mkdir})=>mkdir(repo,{recursive:true}));
  git("git",["init","-b","main"],repo);
  await writeFile(join(repo,"README.md"),"termux fixture\n","utf8");
  git("git",["add","README.md"],repo);
  git("git",["-c","user.name=ARCA Test","-c","user.email=arca@example.invalid","commit","-m","fixture"],repo);
  return repo;
}

test("Termux identity is generated locally and private key is never part of public identity",async()=>{
  await withTemp(async root=>{
    const dir=join(root,"identity");
    const created=await initTermuxV41Identity({directory:dir,nodeId:"vince-termux-fixture"});
    assert.equal(created.identity.nodeId,"vince-termux-fixture");
    assert.equal(created.identity.algorithm,"Ed25519");
    assert.match(created.identity.keyFingerprint,/^[a-f0-9]{64}$/);
    assert.equal("privateKey" in created.identity,false);
    assert.equal("privateKeyPem" in created.identity,false);

    const loaded=await loadTermuxV41Identity({directory:dir});
    assert.deepEqual(loaded.identity,created.identity);
    const privateText=await readFile(join(dir,"ed25519-private.pem"),"utf8");
    assert.match(privateText,/BEGIN PRIVATE KEY/);
    assert.equal(JSON.stringify(created.identity).includes("PRIVATE KEY"),false);

    const mode=(await stat(join(dir,"ed25519-private.pem"))).mode & 0o777;
    assert.equal(mode,0o600);
  });
});

test("Termux signed result verifies under the canonical V4.1 verifier with Termux provenance",async()=>{
  await withTemp(async root=>{
    const dir=join(root,"identity");
    await initTermuxV41Identity({directory:dir,nodeId:"vince-termux-fixture"});
    const loaded=await loadTermuxV41Identity({directory:dir});
    const req=request();
    const result=buildSignedTermuxV41Result({
      request:req,
      identity:loaded.identity,
      privateKey:loaded.privateKey,
      git:{
        stdout:"## main\n",
        stderr:"",
        gitBranch:"main",
        gitHead:"a".repeat(40),
        gitDirty:false
      },
      startedAt:T0,
      finishedAt:T1
    });
    const proof=verifyV41AttestedResult({
      request:req,
      result,
      pinnedIdentity:loaded.identity,
      challengeLedger:new Set(),
      now:T0,
      remoteEnvironment:"termux-android"
    });
    assert.equal(proof.remoteEnvironment,"termux-android");
    assert.equal(proof.executionState,"ATTESTED_VERIFIED_RESULT");
    assert.equal(proof.cryptographicWorkerAttestation,true);
    assert.equal(proof.workerNodeId,"vince-termux-fixture");
    assert.equal(proof.authorityExpanded,false);
  });
});

test("Termux git-status uses a bounded real git repository without shell semantics",async()=>{
  await withTemp(async root=>{
    const repo=await makeGitRepo(root);
    const clean=inspectGitStatus({repoPath:repo});
    assert.equal(clean.gitBranch,"main");
    assert.match(clean.gitHead,/^[a-f0-9]{40}$/);
    assert.equal(clean.gitDirty,false);

    await writeFile(join(repo,"dirty.txt"),"dirty\n","utf8");
    const dirty=inspectGitStatus({repoPath:repo});
    assert.equal(dirty.gitDirty,true);
    assert.match(dirty.stdout,/dirty\.txt/);
  });
});


test("public identity publication contains no private key material",async()=>{
  await withTemp(async root=>{
    const dir=join(root,"identity");
    await initTermuxV41Identity({directory:dir,nodeId:"vince-termux-publish"});
    const calls=[];
    const channelClient={
      async createJson(call){calls.push(call);return {ok:true}}
    };
    const result=await publishTermuxV41Identity({
      identityDirectory:dir,
      channelRepository:"uknwplayer/ARCA",
      channelBranch:"vince-v41-termux-channel",
      channelClient
    });
    assert.equal(result.status,"PUBLIC_IDENTITY_PUBLISHED");
    assert.equal(calls.length,1);
    assert.equal(calls[0].path,"remote-jobs/v4.1/identities/vince-termux-publish.json");
    const serialized=JSON.stringify(calls[0].value);
    assert.equal(serialized.includes("PRIVATE KEY"),false);
    assert.equal(serialized.includes("privateKey"),false);
    assert.equal(calls[0].value.identity.nodeId,"vince-termux-publish");
  });
});

test("one-shot worker reads one request, publishes one signed result and blocks challenge replay",async()=>{
  await withTemp(async root=>{
    const repo=await makeGitRepo(root);
    const dir=join(root,"identity");
    await initTermuxV41Identity({directory:dir,nodeId:"vince-termux-one-shot"});
    const req=request("vince-v41-termux-one-shot-001");
    const published=[];
    const channelClient={
      async readJson(){return req},
      async createJson(call){published.push(call);return {ok:true}}
    };
    const times=[T0,T0,T1,T1];
    let i=0;
    const clock=()=>times[Math.min(i++,times.length-1)];

    const outcome=await runTermuxV41OneShot({
      jobId:req.jobId,
      repoPath:repo,
      identityDirectory:dir,
      channelRepository:"uknwplayer/ARCA",
      channelBranch:"vince-v41-termux-channel",
      channelClient,
      clock
    });
    assert.equal(outcome.workerKind,"termux-android");
    assert.equal(published.length,1);
    assert.equal(published[0].path,`remote-jobs/v4.1/results/${req.jobId}.json`);
    assert.equal(published[0].value.jobId,req.jobId);
    assert.equal(published[0].value.workerIdentity.nodeId,"vince-termux-one-shot");
    assert.equal(JSON.stringify(published[0].value).includes("PRIVATE KEY"),false);

    await assert.rejects(
      ()=>runTermuxV41OneShot({
        jobId:req.jobId,
        repoPath:repo,
        identityDirectory:dir,
        channelRepository:"uknwplayer/ARCA",
        channelBranch:"vince-v41-termux-channel",
        channelClient,
        clock:()=>T0
      }),
      /CHALLENGE_REPLAY/
    );
    assert.equal(published.length,1);
  });
});

test("one-shot worker rejects unsafe job id before any channel access",async()=>{
  let reads=0;
  await assert.rejects(
    ()=>runTermuxV41OneShot({
      jobId:"../../unsafe",
      channelClient:{
        async readJson(){reads++;return {}},
        async createJson(){throw new Error("must not publish")}
      }
    }),
    /JOB_ID_INVALID/
  );
  assert.equal(reads,0);
});
