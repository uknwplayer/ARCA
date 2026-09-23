import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {sealCustodyDirectory} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {observePncpCustodyStructure} from "../src/investigation/m5-pncp-custody-structure-observer.mjs";

const sha=v=>createHash("sha256").update(v).digest("hex");
const passphrase="synthetic-pncp-passphrase-0123456789";

function fixtureEnvelope(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-obs-"));
  fs.writeFileSync(path.join(root,"page.json"),JSON.stringify({
    data:[{numeroControlePNCP:"X",orgaoEntidade:{cnpj:"00000000000000"},valorTotalEstimado:10}],
    totalPaginas:1
  }));
  fs.writeFileSync(path.join(root,"manifest.json"),JSON.stringify({status:"CAPTURED",count:1}));
  fs.writeFileSync(path.join(root,"note.txt"),"synthetic");
  const envelope=sealCustodyDirectory({
    root,passphrase,repository:"uknwplayer/ARCA",
    revision:"a".repeat(40),scopeHash:"b".repeat(64),
    sealedAt:"2026-09-23T23:10:00.000Z"
  });
  fs.rmSync(root,{recursive:true,force:true});
  return envelope;
}

test("PNCP observer emits structure only and no source values",()=>{
  const envelope=fixtureEnvelope();
  const observation=observePncpCustodyStructure({
    envelope,passphrase,
    expectedEnvelopeSha256:sha(JSON.stringify(envelope)),
    expectedReceiptSha256:"c".repeat(64),
    expectedScopeSha256:"b".repeat(64),
    observerRevision:"d".repeat(40)
  });
  assert.equal(observation.structure.fileCount,3);
  assert.equal(observation.valuesIncluded,false);
  assert.equal(observation.rawBytesIncluded,false);
  assert.equal(observation.normalizationPerformed,false);
  assert.equal(observation.publicationAttempted,false);
  assert.equal(observation.correlationAttempted,false);
  assert.equal(JSON.stringify(observation).includes("00000000000000"),false);
  assert.equal(JSON.stringify(observation).includes('"X"'),false);
  assert.ok(observation.structure.files.some(x=>x.contentKind==="json"));
  assert.match(observation.observedStructureSha256,/^[a-f0-9]{64}$/);
});

test("PNCP observer fails closed on envelope or scope mismatch",()=>{
  const envelope=fixtureEnvelope();
  assert.throws(()=>observePncpCustodyStructure({
    envelope,passphrase,
    expectedEnvelopeSha256:"0".repeat(64),
    expectedReceiptSha256:"c".repeat(64),
    expectedScopeSha256:"b".repeat(64)
  }),/ENVELOPE_HASH_MISMATCH/);
  assert.throws(()=>observePncpCustodyStructure({
    envelope,passphrase,
    expectedEnvelopeSha256:sha(JSON.stringify(envelope)),
    expectedReceiptSha256:"c".repeat(64),
    expectedScopeSha256:"0".repeat(64)
  }),/SCOPE_HASH_MISMATCH/);
});

test("PNCP observer workflow has no PNCP network capability",()=>{
  const wf=fs.readFileSync(".github/workflows/arca-m5-pncp-custody-schema-observer.yml","utf8");
  assert.match(wf,/run-id: 35547609136/);
  assert.match(wf,/ARCA_PNCP_CUSTODY_PASSPHRASE/);
  assert.doesNotMatch(wf,/PNCP_PUBLIC_GET_ONLY/);
  assert.doesNotMatch(wf,/pncp\.gov\.br\/api/);
  assert.doesNotMatch(wf,/ARCA_PNCP_LIVE_UF/);
});
