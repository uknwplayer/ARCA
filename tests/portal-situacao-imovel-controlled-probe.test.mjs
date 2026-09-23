import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createPortalSituacaoImovelTransport} from "../src/investigation/portal-situacao-imovel-transport.mjs";
import {buildPortalSituacaoImovelScope} from "../src/investigation/portal-situacao-imovel-scope.mjs";
import {runPortalSituacaoImovelPreflight} from "../scripts/arca-portal-situacao-imovel-preflight.mjs";
import {runPortalSituacaoImovelProbe} from "../scripts/arca-portal-situacao-imovel-live-probe.mjs";

const apiKey="synthetic-portal-api-key-0123456789";
const passphrase="synthetic-passphrase-for-custody-0123456789";
const revision="a".repeat(40);
const envBase=()=>({
  ARCA_PORTAL_API_KEY:apiKey,
  ARCA_PORTAL_TOKEN_PROVENANCE:"OFFICIAL_EMAIL_REGISTRATION",
  ARCA_PORTAL_TOKEN_RECEIVED_AT:"2026-09-23T01:41:18.000Z",
  ARCA_CUSTODY_VAULT_REPOSITORY:"uknwplayer/private-vault",
  ARCA_CUSTODY_VAULT_TOKEN:"synthetic-vault-token-0123456789",
  ARCA_CUSTODY_VAULT_BRANCH:"main",
  GITHUB_REPOSITORY:"uknwplayer/ARCA",
  GITHUB_SHA:revision
});
const custodyState=()=>({ready:true,private:true,repositoryHash:"b".repeat(64),branch:"main",headSha:"c".repeat(40)});

test("scope SI is deterministic and one-request zero-retry",()=>{
  const a=buildPortalSituacaoImovelScope({revision});
  const b=buildPortalSituacaoImovelScope({revision});
  assert.equal(a.scopeSha256,b.scopeSha256);
  assert.equal(a.scope.path,"/api-de-dados/situacao-imovel");
  assert.deepEqual(a.scope.query,{});
  assert.deepEqual(a.scope.budgets,{maxRequests:1,maxBytes:32768,timeoutMs:30000,retries:0});
});

test("transport performs exact GET once and refuses second request",async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify(["OCUPADO","VAGO"]),{status:200,headers:{"content-type":"application/json"}});
  };
  const transport=createPortalSituacaoImovelTransport({fetchImpl,apiKey});
  const first=await transport.fetchOnce();
  assert.equal(first.status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://api.portaldatransparencia.gov.br/api-de-dados/situacao-imovel");
  assert.equal(calls[0].options.method,"GET");
  assert.equal(calls[0].options.headers["chave-api-dados"],apiKey);
  await assert.rejects(()=>transport.fetchOnce(),/REQUEST_BUDGET_EXCEEDED/);
});

test("Gate 040-SI is isolated and produces target-bound attestation",async()=>{
  const result=await runPortalSituacaoImovelPreflight({
    env:{...envBase(),ARCA_PORTAL_PREFLIGHT_CONFIRMATION:"PORTAL_PREFLIGHT_ONLY"},
    durableCustodyBackend:{async preflight(){return custodyState()}}
  });
  assert.equal(result.status,"READY_FOR_EXPLICIT_AUTHORIZATION");
  assert.equal(result.targetId,"PORTAL_SITUACAO_IMOVEL");
  assert.equal(result.portalNetworkUsed,false);
  assert.equal(result.portalRequestCapabilityPresent,false);
  assert.match(result.preflightSha256,/^[a-f0-9]{64}$/);
});

test("live probe validates binding, observes 2xx and remains one request",async()=>{
  const preflight=await runPortalSituacaoImovelPreflight({
    env:{...envBase(),ARCA_PORTAL_PREFLIGHT_CONFIRMATION:"PORTAL_PREFLIGHT_ONLY"},
    durableCustodyBackend:{async preflight(){return custodyState()}}
  });
  let calls=0;
  const stable=value=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(stable).join(",")+"]":"{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
  const sha=value=>createHash("sha256").update(value).digest("hex");
  const backend={
    async preflight(){return custodyState()},
    async persist({envelope,proof}){return {status:"STORED",receiptHash:"d".repeat(64),vaultCommitSha:"e".repeat(40),receipt:{receiptHash:"d".repeat(64),envelopeHash:sha(JSON.stringify(envelope)),scopeHash:proof.scopeHash,captureProofHash:sha(stable(proof))},envelopeHash:sha(JSON.stringify(envelope)),captureProofHash:sha(stable(proof))}},
    async persistStatusProof({proof}){return {status:"STORED_PRIVATE",proofHash:sha(stable(proof)),vaultCommitSha:"f".repeat(40)}}
  };
  const result=await runPortalSituacaoImovelProbe({
    env:{...envBase(),ARCA_PORTAL_CONFIRMATION:"PORTAL_SITUACAO_IMOVEL_GET_ONLY",ARCA_PORTAL_CUSTODY_PASSPHRASE:passphrase,ARCA_PORTAL_PREFLIGHT_SHA256:preflight.preflightSha256,ARCA_PORTAL_CREDENTIAL_FINGERPRINT_SHA256:preflight.credentialFingerprintSha256},
    durableCustodyBackend:backend,
    fetchImpl:async()=>{calls+=1;return new Response(JSON.stringify(["OCUPADO","VAGO"]),{status:200,headers:{"content-type":"application/json"}})},
    outputDir:await import("node:fs").then(fs=>fs.mkdtempSync("/tmp/arca-si-test-"))
  });
  assert.equal(calls,1);
  assert.equal(result.status,"SUCCEEDED");
  assert.equal(result.proof.httpStatus,200);
  assert.equal(result.proof.credentialObservation.activeVerified,true);
  assert.equal(result.proof.recordCount,2);
  assert.equal(result.proof.budgets.retries,0);
});
