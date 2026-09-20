import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {
  migrateEncryptedCustodyArtifact
} from "../scripts/arca-custody-migrate-artifact.mjs";

function sha256(value){return createHash("sha256").update(value).digest("hex")}
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"arca-custody-migration-"));
  const envelope={
    schema:"arca.encrypted-custody-envelope.v0.1",
    status:"SEALED",
    algorithm:"AES-256-GCM",
    kdf:{name:"scrypt",N:16384,r:8,p:1},
    repository:"example/public-control-plane",
    revision:"cdc5055c5641f7c894cdd75503d2a9bd92148c08",
    scopeHash:"1".repeat(64),
    sealedAt:"2026-09-21T03:31:30.945Z",
    fileCount:1,
    totalBytes:32,
    contentRootHash:"2".repeat(64),
    payloadHash:"3".repeat(64),
    salt:"AAAAAAAAAAAAAAAAAAAAAA==",
    iv:"AAAAAAAAAAAAAAAA",
    authTag:"AAAAAAAAAAAAAAAAAAAAAA==",
    ciphertext:"ZW5jcnlwdGVk",
    plaintextIncluded:false
  };
  const proof={
    schema:"arca.pncp-controlled-live-probe.v0.1",
    status:"CAPTURED_AND_SEALED",
    repository:envelope.repository,
    revision:envelope.revision,
    resultHash:"4".repeat(64),
    networkUsed:true,
    custody:{
      encrypted:true,
      envelopeHash:sha256(JSON.stringify(envelope)),
      contentRootHash:envelope.contentRootHash,
      payloadHash:envelope.payloadHash,
      fileCount:envelope.fileCount,
      totalBytes:envelope.totalBytes,
      plaintextPublished:false
    },
    classifierEmittedSignals:false,
    investigationIngressUsed:false,
    automaticAdversePublication:false,
    humanReviewRequired:true,
    anomalyIsNotIrregularity:true
  };
  fs.writeFileSync(path.join(dir,"pncp-live-custody.envelope.json"),JSON.stringify(envelope)+"\n");
  fs.writeFileSync(path.join(dir,"pncp-live-proof.json"),JSON.stringify(proof,null,2)+"\n");
  return {dir,envelope,proof};
}

function env(inputDir,outputDir,overrides={}){
  return {
    ARCA_CUSTODY_MIGRATION_CONFIRMATION:"MIGRATE_ENCRYPTED_CUSTODY_ONLY",
    ARCA_CUSTODY_SOURCE_RUN_ID:"35544888070",
    ARCA_CUSTODY_MIGRATION_INPUT_DIR:inputDir,
    ARCA_CUSTODY_MIGRATION_OUTPUT_DIR:outputDir,
    ...overrides
  };
}

test("migration persists only the encrypted envelope and emits sanitized proof",async()=>{
  const source=fixture();
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"arca-custody-migration-out-"));
  const calls={preflight:0,persist:0};
  const backend={
    async preflight(){calls.preflight+=1;return {ready:true,private:true}},
    async persist({envelope,proof}){
      calls.persist+=1;
      assert.equal(envelope.plaintextIncluded,false);
      assert.equal(proof.custody.plaintextPublished,false);
      return {status:"STORED",receiptHash:"5".repeat(64),vaultCommitSha:"6".repeat(40)};
    }
  };
  const result=await migrateEncryptedCustodyArtifact({
    env:env(source.dir,output),
    durableCustodyBackend:backend
  });
  assert.equal(calls.preflight,1);
  assert.equal(calls.persist,1);
  assert.equal(result.proof.status,"MIGRATED_PRIVATE");
  assert.equal(result.proof.sourceRunId,"35544888070");
  assert.equal(result.proof.decryptionPerformed,false);
  assert.equal(result.proof.pncpNetworkUsed,false);
  assert.equal(result.proof.plaintextStored,false);
  assert.match(result.proof.vaultCommitRefHash,/^[a-f0-9]{64}$/);
});

test("migration authorization fails before backend access",async()=>{
  const source=fixture();
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"arca-custody-migration-out-"));
  let touched=false;
  const backend={
    async preflight(){touched=true;return {ready:true,private:true}},
    async persist(){touched=true;return null}
  };
  await assert.rejects(()=>migrateEncryptedCustodyArtifact({
    env:env(source.dir,output,{ARCA_CUSTODY_MIGRATION_CONFIRMATION:"WRONG"}),
    durableCustodyBackend:backend
  }),/NOT_AUTHORIZED/);
  assert.equal(touched,false);
});

test("migration refuses plaintext or malformed source artifact",async()=>{
  const source=fixture();
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"arca-custody-migration-out-"));
  const file=path.join(source.dir,"pncp-live-custody.envelope.json");
  const bad={...source.envelope,plaintextIncluded:true};
  fs.writeFileSync(file,JSON.stringify(bad)+"\n");
  await assert.rejects(()=>migrateEncryptedCustodyArtifact({
    env:env(source.dir,output),
    durableCustodyBackend:{
      async preflight(){return {ready:true,private:true}},
      async persist(){throw new Error("must not persist")}
    }
  }),/ENVELOPE_INVALID/);
});
