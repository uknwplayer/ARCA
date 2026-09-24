import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {canonicalJson,sha256} from "../src/investigation/public-source-contract.mjs";
import {deriveM5PncpContractCoverage} from "../src/investigation/m5-pncp-contract-coverage-private.mjs";
import {createM5PncpContractCoverageTransport} from "../src/investigation/m5-pncp-contract-coverage-transport.mjs";
import {sealCustodyDirectory} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {createGitHubPrivateCustodyBackend} from "../src/machine-bridge/durable-private-custody.mjs";

function arg(name){
  const i=process.argv.indexOf(name);
  if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_M_ARGUMENT_REQUIRED");
  return process.argv[i+1];
}
function req(value,code,max=4096,min=1){
  const out=String(value??"");
  if(out.length<min||out.length>max)throw new Error(code);
  return out;
}
function h64(value,code){
  const out=String(value??"").trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(out))throw new Error(code);
  return out;
}
function rev(value){
  const out=String(value??"").trim().toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(out))throw new Error("ARCA_M5_M_REVISION_INVALID");
  return out;
}
function repo(value){
  const out=String(value??"").trim();
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(out))
    throw new Error("ARCA_M5_M_REPOSITORY_INVALID");
  return out;
}
function pass(value){
  const out=String(value??"");
  if(out.length<24||out.length>4096)throw new Error("ARCA_M5_M_PASSPHRASE_REQUIRED");
  return out;
}
function responseSummary(result){
  let jsonArray=false,recordCount=null,fieldsObserved={
    supplierIdentifier:false,supplierName:false,procurementControlReference:false,
    contractOrCommitmentReference:false,processReference:false,agencyIdentifier:false,
    amountFields:false
  };
  if(result.ok){
    try{
      const parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(result.bodyBytes));
      if(Array.isArray(parsed)&&parsed.length<=25){
        jsonArray=true;recordCount=parsed.length;
        const objects=parsed.filter(x=>x&&typeof x==="object"&&!Array.isArray(x));
        const has=key=>objects.length>0&&objects.every(x=>Object.hasOwn(x,key));
        fieldsObserved={
          supplierIdentifier:has("niFornecedor"),
          supplierName:has("nomeRazaoSocialFornecedor"),
          procurementControlReference:has("numeroControlePNCPCompra"),
          contractOrCommitmentReference:has("numeroContratoEmpenho"),
          processReference:has("processo"),
          agencyIdentifier:objects.length>0&&objects.every(x=>x.orgaoEntidade&&typeof x.orgaoEntidade==="object"&&Object.hasOwn(x.orgaoEntidade,"cnpj")),
          amountFields:objects.length>0&&objects.every(x=>["valorInicial","valorGlobal","valorAcumulado"].some(k=>Object.hasOwn(x,k)))
        };
      }
    }catch{}
  }
  return Object.freeze({
    targetSha256:result.targetSha256,
    httpStatus:result.status,
    httpStatusClass:result.statusClass,
    responseByteCount:result.responseByteCount,
    responseBytesSha256:result.responseBytesSha256,
    jsonArray,
    ...(recordCount===null?{}:{recordCount}),
    fieldsObserved:Object.freeze(fieldsObserved)
  });
}

export async function runM5PncpContractCoverageLive({
  env=process.env,
  fetchImpl=globalThis.fetch,
  custodyBackend=null
}={}){
  if(env.ARCA_M5_M_CONFIRMATION!=="PNCP_CONTRACT_COVERAGE_GET_ONLY")
    throw new Error("ARCA_M5_M_EXPLICIT_CONFIRMATION_REQUIRED");

  const envelope=JSON.parse(fs.readFileSync(path.resolve(arg("--pncp-envelope")),"utf8"));
  const cfg=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),"config/m5-pncp-contract-coverage.json"),"utf8"
  ));
  const bindingInput=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),cfg.pncpBindingConfig),"utf8"
  ));
  const revision=rev(env.GITHUB_SHA);
  const derived=deriveM5PncpContractCoverage({
    envelope,
    passphrase:pass(env.ARCA_PNCP_CUSTODY_PASSPHRASE),
    pncpBindingInput:bindingInput,
    expectedEnvelopeSha256:cfg.normalizedEnvelopeSha256,
    screeningSha256:cfg.screeningSha256,
    revision
  });
  const expectedCandidate=h64(env.ARCA_M5_M_CANDIDATE_SHA256,"ARCA_M5_M_CANDIDATE_REQUIRED");
  if(derived.candidate.candidateSha256!==expectedCandidate)
    throw new Error("ARCA_M5_M_CANDIDATE_MISMATCH");

  const executed=await createM5PncpContractCoverageTransport({
    fetchImpl,
    timeoutMs:derived.plan.budgets.timeoutMs,
    maxBytesPerResponse:derived.plan.budgets.maxBytesPerResponse,
    maxRequests:derived.plan.budgets.maxRequests
  }).executePlan(derived.plan);
  if(executed.requestCount!==2||executed.results.length!==2)
    throw new Error("ARCA_M5_M_REQUEST_COUNT_INVALID");

  const root=fs.mkdtempSync(path.join(os.tmpdir(),"arca-m5m-live-"));
  const staging=path.join(root,"staging");
  fs.mkdirSync(staging,{recursive:true,mode:0o700});
  try{
    for(let i=0;i<executed.results.length;i++){
      const r=executed.results[i];
      fs.writeFileSync(
        path.join(staging,`response-${i+1}-${r.targetSha256.slice(0,12)}.bin`),
        r.bodyBytes,{mode:0o600,flag:"wx"}
      );
    }
    fs.writeFileSync(
      path.join(staging,"capture-meta.json"),
      canonicalJson({
        candidateSha256:derived.candidate.candidateSha256,
        planSha256:derived.plan.planSha256,
        responses:executed.results.map(r=>({
          targetSha256:r.targetSha256,
          httpStatus:r.status,
          responseByteCount:r.responseByteCount,
          responseBytesSha256:r.responseBytesSha256
        }))
      })+"\n",
      {encoding:"utf8",mode:0o600,flag:"wx"}
    );
    const sourceRepo=repo(env.GITHUB_REPOSITORY);
    const custodyEnvelope=sealCustodyDirectory({
      root:staging,
      passphrase:pass(env.ARCA_PNCP_CUSTODY_PASSPHRASE),
      repository:sourceRepo,
      revision,
      scopeHash:derived.plan.planSha256
    });
    const envelopeHash=sha256(JSON.stringify(custodyEnvelope));
    const observations=Object.freeze(executed.results.map(responseSummary));
    const resultBody={
      candidateSha256:derived.candidate.candidateSha256,
      planSha256:derived.plan.planSha256,
      observations:observations.map(x=>({
        targetSha256:x.targetSha256,
        httpStatus:x.httpStatus,
        responseBytesSha256:x.responseBytesSha256
      }))
    };
    const resultHash=sha256(canonicalJson(resultBody));
    const baseProof={
      schema:"arca.pncp-controlled-live-probe.v0.1",
      probeKind:"M5_PNCP_CONTRACT_COVERAGE",
      status:"CAPTURED_AND_SEALED",
      repository:sourceRepo,
      revision,
      scope:{
        kind:"M5-M",
        candidateSha256:derived.candidate.candidateSha256,
        targetCount:2
      },
      shardId:"M5-M-PNCP-CONTRACT-COVERAGE",
      planFingerprint:derived.plan.planSha256,
      resultHash,
      targetCount:2,
      observationCount:observations.length,
      networkUsed:true,
      budgets:derived.plan.budgets,
      observations,
      custody:{
        encrypted:true,
        envelopeHash,
        contentRootHash:custodyEnvelope.contentRootHash,
        payloadHash:custodyEnvelope.payloadHash,
        fileCount:custodyEnvelope.fileCount,
        totalBytes:custodyEnvelope.totalBytes,
        plaintextPublished:false
      },
      classifierEmittedSignals:false,
      investigationIngressUsed:false,
      automaticAdversePublication:false,
      correlationAttempted:false,
      publicationAttempted:false,
      humanReviewRequired:true,
      anomalyIsNotIrregularity:true
    };

    let store=custodyBackend;
    if(!store){
      store=createGitHubPrivateCustodyBackend({
        repository:repo(env.ARCA_CUSTODY_VAULT_REPOSITORY),
        branch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
        token:req(env.ARCA_CUSTODY_VAULT_TOKEN,"ARCA_M5_M_VAULT_TOKEN_REQUIRED",4096,20),
        fetchImpl
      });
    }
    const preflight=await store.preflight();
    if(preflight?.ready!==true||preflight?.private!==true)
      throw new Error("ARCA_M5_M_CUSTODY_PREFLIGHT_FAILED");
    const stored=await store.persist({envelope:custodyEnvelope,proof:baseProof});
    if(!["STORED","ALREADY_STORED"].includes(stored?.status))
      throw new Error("ARCA_M5_M_CUSTODY_PERSIST_FAILED");

    const proof={
      ...baseProof,
      durableCustody:{
        required:true,
        status:stored.status==="STORED"?"STORED_PRIVATE":"ALREADY_STORED_PRIVATE",
        receiptHash:stored.receiptHash,
        vaultCommitRefHash:createHash("sha256").update(stored.vaultCommitSha).digest("hex"),
        plaintextStored:false
      }
    };
    const output=path.resolve(arg("--output"));
    fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
    fs.writeFileSync(output,JSON.stringify(proof,null,2)+"\n",{
      encoding:"utf8",mode:0o600,flag:"wx"
    });
    return proof;
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
}

async function main(){
  try{
    const p=await runM5PncpContractCoverageLive();
    process.stdout.write(JSON.stringify({
      status:p.status,
      probeKind:p.probeKind,
      targetCount:p.targetCount,
      observationCount:p.observationCount,
      planFingerprint:p.planFingerprint,
      resultHash:p.resultHash,
      durableCustodyStatus:p.durableCustody.status,
      observations:p.observations.map(x=>({
        targetSha256:x.targetSha256,
        httpStatus:x.httpStatus,
        responseByteCount:x.responseByteCount,
        responseBytesSha256:x.responseBytesSha256,
        jsonArray:x.jsonArray,
        recordCount:x.recordCount??null,
        fieldsObserved:x.fieldsObserved
      }))
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))
      ?error.message:"ARCA_M5_M_LIVE_FAILED";
    process.stderr.write(code+"\n");process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
