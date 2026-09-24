import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {canonicalJson,sha256} from "../src/investigation/public-source-contract.mjs";
import {deriveM5N1ItemDiscovery} from "../src/investigation/m5-n1-pncp-item-discovery-private.mjs";
import {createM5N1ItemDiscoveryTransport} from "../src/investigation/m5-n1-pncp-item-discovery-transport.mjs";
import {observeM5N1ItemsResponse} from "../src/investigation/m5-n1-pncp-item-response.mjs";
import {sealCustodyDirectory} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {createGitHubPrivateCustodyBackend} from "../src/machine-bridge/durable-private-custody.mjs";

function arg(name){const i=process.argv.indexOf(name);if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_N1_ARGUMENT_REQUIRED");return process.argv[i+1]}
function req(v,c,min=1,max=4096){const o=String(v??"");if(o.length<min||o.length>max)throw new Error(c);return o}
function h64(v,c){const o=String(v??"").trim().toLowerCase();if(!/^[a-f0-9]{64}$/.test(o))throw new Error(c);return o}
function rev(v){const o=String(v??"").trim().toLowerCase();if(!/^[a-f0-9]{40}$/.test(o))throw new Error("ARCA_M5_N1_REVISION_INVALID");return o}
function repo(v){const o=String(v??"").trim();if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(o))throw new Error("ARCA_M5_N1_REPO_INVALID");return o}
function pass(v){return req(v,"ARCA_M5_N1_PASSPHRASE_REQUIRED",24,4096)}

export async function runM5N1Live({env=process.env,fetchImpl=globalThis.fetch,custodyBackend=null}={}){
  const cfg=JSON.parse(fs.readFileSync(path.join(process.cwd(),"config/m5-n1-pncp-item-discovery.json"),"utf8"));
  const envelope=JSON.parse(fs.readFileSync(path.resolve(arg("--pncp-envelope")),"utf8"));
  const binding=JSON.parse(fs.readFileSync(path.join(process.cwd(),cfg.pncpBindingConfig),"utf8"));
  const revision=rev(env.GITHUB_SHA);
  const derived=deriveM5N1ItemDiscovery({
    envelope,passphrase:pass(env.ARCA_PNCP_CUSTODY_PASSPHRASE),
    pncpBindingInput:binding,expectedEnvelopeSha256:cfg.normalizedEnvelopeSha256,
    screeningSha256:cfg.screeningSha256,m5mDiagnosisSha256:cfg.m5mDiagnosisSha256,revision
  });
  const expected=h64(env.ARCA_M5_N1_CANDIDATE_SHA256,"ARCA_M5_N1_CANDIDATE_REQUIRED");
  if(derived.candidate.candidateSha256!==expected)throw new Error("ARCA_M5_N1_CANDIDATE_MISMATCH");
  if(derived.candidate.getCostPolicy?.costClass!=="NO_MONETARY_CHARGE_OBSERVED"||
     derived.candidate.getCostPolicy?.autoExecutionAllowed!==true||
     derived.candidate.humanAuthorizationRequired!==false||
     derived.candidate.sourceNetworkAuthorized!==true||
     derived.candidate.newPncpGetAuthorized!==true)
    throw new Error("ARCA_M5_N1_COST_POLICY_NOT_EXECUTABLE");
  const executed=await createM5N1ItemDiscoveryTransport({
    fetchImpl,timeoutMs:derived.plan.budgets.timeoutMs,
    maxBytesPerResponse:derived.plan.budgets.maxBytesPerResponse,maxRequests:2
  }).executePlan(derived.plan);
  if(executed.requestCount!==2||executed.results.length!==2)throw new Error("ARCA_M5_N1_REQUEST_COUNT_INVALID");

  const root=fs.mkdtempSync(path.join(os.tmpdir(),"arca-m5n1-live-")), staging=path.join(root,"staging");
  fs.mkdirSync(staging,{recursive:true,mode:0o700});
  try{
    for(let i=0;i<2;i++){
      const r=executed.results[i];
      fs.writeFileSync(path.join(staging,`items-${i+1}-${r.targetSha256.slice(0,12)}.bin`),r.bodyBytes,{mode:0o600,flag:"wx"});
    }
    fs.writeFileSync(path.join(staging,"capture-meta.json"),canonicalJson({
      candidateSha256:derived.candidate.candidateSha256,planSha256:derived.plan.planSha256,
      responses:executed.results.map(r=>({targetSha256:r.targetSha256,httpStatus:r.status,responseByteCount:r.responseByteCount,responseBytesSha256:r.responseBytesSha256}))
    })+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});

    const sourceRepo=repo(env.GITHUB_REPOSITORY);
    const custodyEnvelope=sealCustodyDirectory({
      root:staging,passphrase:pass(env.ARCA_PNCP_CUSTODY_PASSPHRASE),
      repository:sourceRepo,revision,scopeHash:derived.plan.planSha256
    });
    const envelopeHash=sha256(JSON.stringify(custodyEnvelope));

    let store=custodyBackend;
    if(!store)store=createGitHubPrivateCustodyBackend({
      repository:repo(env.ARCA_CUSTODY_VAULT_REPOSITORY),branch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
      token:req(env.ARCA_CUSTODY_VAULT_TOKEN,"ARCA_M5_N1_VAULT_TOKEN_REQUIRED",20,4096),fetchImpl
    });
    const pf=await store.preflight();
    if(pf?.ready!==true||pf?.private!==true)throw new Error("ARCA_M5_N1_CUSTODY_PREFLIGHT_FAILED");

    const structural=executed.results.map(r=>observeM5N1ItemsResponse({
      bytes:r.bodyBytes,httpStatus:r.status,targetSha256:r.targetSha256,pageSize:10
    }));
    const resultHash=sha256(canonicalJson({
      candidateSha256:derived.candidate.candidateSha256,planSha256:derived.plan.planSha256,
      observations:structural.map(x=>({
        targetSha256:x.targetSha256,httpStatus:x.httpStatus,itemCount:x.itemCount,
        itemsWithResultCount:x.itemsWithResultCount,pagePossiblyTruncated:x.pagePossiblyTruncated,
        resultItemSetSha256:x.resultItemSetSha256,nextStageReady:x.nextStageReady
      }))
    }));
    const proofBase={
      schema:"arca.m5-n1-pncp-item-discovery-proof.v1",status:"CAPTURED_AND_SEALED",
      source:"PNCP",repository:sourceRepo,revision,candidateSha256:derived.candidate.candidateSha256,
      planSha256:derived.plan.planSha256,resultHash,requestCount:2,retries:0,networkUsed:true,
      observations:structural,custody:{encrypted:true,envelopeHash,contentRootHash:custodyEnvelope.contentRootHash,
        payloadHash:custodyEnvelope.payloadHash,fileCount:custodyEnvelope.fileCount,totalBytes:custodyEnvelope.totalBytes,
        plaintextPublished:false},
      publicationAttempted:false,correlationAttempted:false,supplierInferenceAttempted:false,
      executionAuthorizationBasis:"ZERO_MONETARY_COST_GET_POLICY",
      humanAuthorizationRequired:false,
      humanReviewRequired:true,adverseFinding:false
    };
    const stored=await store.persist({envelope:custodyEnvelope,proof:proofBase});
    if(!["STORED","ALREADY_STORED"].includes(stored?.status))throw new Error("ARCA_M5_N1_CUSTODY_PERSIST_FAILED");
    const proof={...proofBase,durableCustody:{
      status:stored.status==="STORED"?"STORED_PRIVATE":"ALREADY_STORED_PRIVATE",receiptHash:stored.receiptHash,
      vaultCommitRefHash:createHash("sha256").update(stored.vaultCommitSha).digest("hex"),plaintextStored:false
    }};
    const output=path.resolve(arg("--output"));fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
    fs.writeFileSync(output,JSON.stringify(proof,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
    return proof;
  }finally{fs.rmSync(root,{recursive:true,force:true})}
}
async function main(){
  try{
    const p=await runM5N1Live();
    process.stdout.write(JSON.stringify({
      status:p.status,requestCount:p.requestCount,retries:p.retries,planSha256:p.planSha256,
      candidateSha256:p.candidateSha256,resultHash:p.resultHash,durableCustodyStatus:p.durableCustody.status,
      observations:p.observations.map(x=>({
        targetSha256:x.targetSha256,httpStatus:x.httpStatus,itemCount:x.itemCount,
        itemsWithResultCount:x.itemsWithResultCount,pagePossiblyTruncated:x.pagePossiblyTruncated,
        resultItemSetSha256:x.resultItemSetSha256,nextStageReady:x.nextStageReady
      }))
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))?error.message:"ARCA_M5_N1_LIVE_FAILED";
    process.stderr.write(code+"\n");process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
