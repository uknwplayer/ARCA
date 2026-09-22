import test from "node:test";
import assert from "node:assert/strict";
import {buildM4ControlledScope} from "../src/investigation/m4-controlled-scope.mjs";

const revision="a6e955b6282f319171654e881ae0d736ce5ed65a";
const pncp=()=>({source:"PNCP",confirmation:"PNCP_PUBLIC_GET_ONLY",revision,
  uf:"AP",date:"20260918",modalityId:6,maxBytes:65536,timeoutMs:30000});
const portal=()=>({source:"PORTAL",confirmation:"PORTAL_DOCUMENT_GET_ONLY",revision,
  documentCode:"175004000012023NS000917",maxBytes:16384,timeoutMs:15000});

test("M4 manifest describes one bounded PNCP shard without enabling network",()=>{
  const output=buildM4ControlledScope(pncp());
  assert.equal(output.scope.uf,"AP");
  assert.equal(output.scope.date,"20260918");
  assert.equal(output.scope.modalityId,6);
  assert.deepEqual(output.budgets,{maxPages:1,maxRecords:10,maxBytes:65536,timeoutMs:30000,retries:0});
  assert.equal(output.networkAuthorizedForThisManifest,false);
  assert.equal(output.publicationAttempted,false);
  assert.match(output.scopeSha256,/^[a-f0-9]{64}$/);
  assert.equal(buildM4ControlledScope(pncp()).scopeSha256,output.scopeSha256);
  assert.equal(Object.isFrozen(output),true);
});

test("Portal manifest hashes an explicit document and exposes no raw identifier",()=>{
  const output=buildM4ControlledScope(portal());
  assert.equal(output.source,"PORTAL");
  assert.equal(output.scope.page,1);
  assert.equal(output.scope.phase,"PAYMENT");
  assert.match(output.scope.documentCodeSha256,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(output).includes("175004000012023NS000917"),false);
  assert.deepEqual(output.budgets,{maxPages:1,maxRecords:1,maxBytes:16384,timeoutMs:15000,retries:0});
});

test("missing or incorrect source confirmation cannot form a manifest",()=>{
  assert.throws(()=>buildM4ControlledScope({...pncp(),confirmation:""}),/CONFIRMATION/);
  assert.throws(()=>buildM4ControlledScope({...portal(),confirmation:"PNCP_PUBLIC_GET_ONLY"}),/CONFIRMATION/);
});

test("manifest rejects secret injection, ambiguous scope and invalid budgets",()=>{
  assert.throws(()=>buildM4ControlledScope({...portal(),token:"private"}),/UNEXPECTED_FIELD/);
  assert.throws(()=>buildM4ControlledScope({...portal(),uf:"SP"}),/UNEXPECTED_FIELD/);
  assert.throws(()=>buildM4ControlledScope({...pncp(),uf:"ZZ"}),/INVALID_UF/);
  assert.throws(()=>buildM4ControlledScope({...pncp(),date:"20260231"}),/INVALID_DATE/);
  assert.throws(()=>buildM4ControlledScope({...portal(),documentCode:""}),/DOCUMENT_CODE/);
  assert.throws(()=>buildM4ControlledScope({...portal(),maxBytes:65537}),/BUDGET/);
  assert.throws(()=>buildM4ControlledScope({...pncp(),maxBytes:1.5}),/BUDGET/);
  assert.throws(()=>buildM4ControlledScope({...portal(),timeoutMs:30001}),/BUDGET/);
  assert.throws(()=>buildM4ControlledScope({...pncp(),retries:1}),/UNEXPECTED_FIELD/);
  assert.throws(()=>buildM4ControlledScope({...portal(),source:"PNCP"}),/UNEXPECTED_FIELD/);
});
