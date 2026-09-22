import test from "node:test";
import assert from "node:assert/strict";
import * as scopeModule from "../src/investigation/m4-controlled-scope.mjs";
const {buildM4ControlledScope}=scopeModule;

const revision="a6e955b6282f319171654e881ae0d736ce5ed65a";
const pncp=()=>({source:"PNCP",confirmation:"PNCP_PUBLIC_GET_ONLY",revision,
  uf:"AP",date:"20260918",modalityId:6,maxBytes:65536,timeoutMs:30000});
const portal=()=>({source:"PORTAL",confirmation:"PORTAL_DOCUMENT_GET_ONLY",revision,
  documentCode:"175004000012023NS000917",maxBytes:16384,timeoutMs:15000});
const portalV02=()=>({...portal(),maxBytes:65536,timeoutMs:30000});

test("M4 manifest describes one bounded PNCP shard without enabling network",()=>{
  const output=buildM4ControlledScope(pncp());
  assert.equal(output.scope.uf,"AP");
  assert.equal(output.scope.date,"20260918");
  assert.equal(output.scope.modalityId,6);
  assert.deepEqual(output.budgets,{maxPages:1,maxRecords:10,maxBytes:65536,timeoutMs:30000,retries:0});
  assert.equal(output.networkAuthorizedForThisManifest,false);
  assert.equal(output.publicationAttempted,false);
  assert.equal(output.scopeSha256,"f535811a0fb7b072ea70a9b930937b2415727a33bf4265c8f343c55a30a59ee3");
  assert.match(output.scopeSha256,/^[a-f0-9]{64}$/);
  assert.equal(buildM4ControlledScope(pncp()).scopeSha256,output.scopeSha256);
  assert.equal(Object.isFrozen(output),true);
});

test("M4 v0.2 scope builder is available without replacing the v0.1 builder",()=>{
  assert.equal(typeof scopeModule.buildM4ControlledScopeV02,"function");
  assert.equal(buildM4ControlledScope(pncp()).schema,"arca.m4-controlled-scope.v0.1");
});

test("Portal v0.2 fixes the related-documents endpoint, payment phase and bounded budget",()=>{
  const output=scopeModule.buildM4ControlledScopeV02(portalV02());
  assert.equal(output.schema,"arca.m4-controlled-scope.v0.2");
  assert.deepEqual(output.scope,{
    endpointId:"PORTAL_EXPENSE_RELATED_DOCUMENTS",
    phaseCode:3,
    documentCodeSha256:"da13731cf48773386fe8f532bc2a817fb208a124e9ce23478d90ed19903f44d6"
  });
  assert.deepEqual(output.budgets,{maxRequests:1,maxRecords:25,maxBytes:65536,timeoutMs:30000,retries:0});
  assert.equal(output.networkAuthorizedForThisManifest,false);
  assert.equal(output.publicationAttempted,false);
  assert.equal(Object.hasOwn(output.scope,"page"),false);
  assert.equal(JSON.stringify(output).includes(portalV02().documentCode),false);
  assert.equal(output.scopeSha256,scopeModule.buildM4ControlledScopeV02(portalV02()).scopeSha256);
});

test("PNCP v0.2 keeps the established PNCP scope and budget semantics",()=>{
  const output=scopeModule.buildM4ControlledScopeV02(pncp());
  assert.equal(output.schema,"arca.m4-controlled-scope.v0.2");
  assert.deepEqual(output.scope,{uf:"AP",date:"20260918",modalityId:6,page:1});
  assert.deepEqual(output.budgets,{maxPages:1,maxRecords:10,maxBytes:65536,timeoutMs:30000,retries:0});
  assert.equal(output.networkAuthorizedForThisManifest,false);
});

test("Portal v0.2 rejects ambiguous code, caller-adjusted budgets and injected keys",()=>{
  const build=scopeModule.buildM4ControlledScopeV02;
  assert.throws(()=>build({...portalV02(),documentCode:" "}),/DOCUMENT_CODE/);
  assert.throws(()=>build({...portalV02(),documentCode:"bad\ncode"}),/DOCUMENT_CODE/);
  assert.throws(()=>build({...portalV02(),maxBytes:65535}),/BUDGET/);
  assert.throws(()=>build({...portalV02(),timeoutMs:29999}),/BUDGET/);
  assert.throws(()=>build({...portalV02(),apiKey:"secret"}),/UNEXPECTED_FIELD/);
  assert.throws(()=>build({...portalV02(),phaseCode:1}),/UNEXPECTED_FIELD/);
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
