import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  PNCP_PRODUCTION_BASE_URL,
  buildPncpProcurementRequestPlan,
  buildPncpPublicUrl,
  capturePncpResponse,
  capturePncpSnapshotResponses,
  collectPncpSnapshot,
  createFixtureTransport,
  createPncpHttpTransport,
  validatePncpPublicTarget
} from "../packages/pncp-connector/src/index.ts";
import {normalizePncpBundle,normalizeProcurementRecord} from "../packages/aie/src/index.ts";

const target={cnpj:"12345678000195",ano:2026,sequencial:7};
function fixtures(){return {
  contratacao:{numeroControlePNCP:"12345678000195-1-000007/2026",processo:"PROC-7/2026",modalidadeNome:"Pregao",objetoCompra:"Alimentos"},
  itens:[{numeroItem:1,descricao:"Arroz",quantidade:100,unidadeMedida:"kg",valorUnitarioEstimado:5},{numeroItem:2,descricao:"Feijao",quantidade:50,unidadeMedida:"kg",valorUnitarioEstimado:8}],
  contratos:[{numeroControlePNCP:"12345678000195-2-000003/2026",numeroControlePNCPCompra:"12345678000195-1-000007/2026",niFornecedor:"11222333000181",nomeRazaoSocialFornecedor:"Fornecedor Fixture",valorInicial:900}],
  "fontes-orcamentarias":{fonteOrcamentaria:[{id:1,nome:"Tesouro"}]},
  "resultados-item-1":{listaResultados:[{numeroItem:1,niFornecedor:"11222333000181",valorUnitarioHomologado:4.9}]},
  "resultados-item-2":{listaResultados:[{numeroItem:2,niFornecedor:"11222333000181",valorUnitarioHomologado:7.8}]}
}}

test("PNCP C1 aceita CNPJ numerico e alfanumerico estrutural",()=>{
  assert.equal(validatePncpPublicTarget(target).cnpj,"12345678000195");
  assert.equal(validatePncpPublicTarget({cnpj:"00.000.000/E08G-12",ano:2026,sequencial:1}).cnpj,"00000000E08G12");
  assert.throws(()=>validatePncpPublicTarget({cnpj:"123",ano:2026,sequencial:1}),/CNPJ/);
});

test("PNCP C1 usa somente base oficial atual e GET publico conhecido",()=>{
  assert.equal(PNCP_PRODUCTION_BASE_URL,"https://pncp.gov.br/api/pncp");
  const plan=buildPncpProcurementRequestPlan(target);
  assert.equal(plan.networkAllowedByPlan,false);
  assert.equal(plan.humanAuthorizationRequiredForNetwork,true);
  assert.equal(plan.publicGetOnly,true);
  assert.ok(plan.requests.length>=4);
  for(const request of plan.requests){
    assert.equal(request.method,"GET");
    assert.equal(request.baseUrl,PNCP_PRODUCTION_BASE_URL);
    assert.equal(request.publicAccess,true);
    assert.equal(request.authenticationRequired,false);
    assert.match(request.path,/^\/v1\//);
  }
  assert.ok(plan.requests.some(request=>request.path.endsWith("/itens")));
  assert.ok(plan.requests.some(request=>request.path.includes("/contratos/contratacao/")));
  assert.ok(plan.requests.some(request=>request.path.endsWith("/fonte-orcamentaria")));
});

test("PNCP C1 allowlist nao permite host, base, traversal, query ou fragment externos",()=>{
  const url=buildPncpPublicUrl(`/v1/orgaos/${target.cnpj}/compras/2026/7`);
  assert.equal(url,`https://pncp.gov.br/api/pncp/v1/orgaos/${target.cnpj}/compras/2026/7`);
  assert.throws(()=>buildPncpPublicUrl("/v1/x","https://example.org/api/pncp"),/allowlist/);
  assert.throws(()=>buildPncpPublicUrl("/v1/x","https://pncp.gov.br/api/consulta"),/allowlist/);
  assert.throws(()=>buildPncpPublicUrl("/v1/../segredo"),/inseguro/);
  assert.throws(()=>buildPncpPublicUrl("/v1/x?next=https://example.org"),/inseguro/);
});

test("PNCP C1 HTTP permanece bloqueado sem opt-in explicito",async()=>{
  const transport=createPncpHttpTransport({allowNetwork:false,maxRetries:0});
  await assert.rejects(transport.get({kind:"contratacao",method:"GET",path:"/v1/teste",baseUrl:PNCP_PRODUCTION_BASE_URL,publicAccess:true,authenticationRequired:false}),/rede PNCP bloqueada/);
});

test("PNCP C1 opt-in faz GET sem Authorization, redirect manual e preserva hash",async()=>{
  let seen=null;
  const fetchImpl=async(url,init)=>{seen={url,init};return new Response('{"ok":true}',{status:200,headers:{"content-type":"application/json","content-length":"11"}})};
  const transport=createPncpHttpTransport({allowNetwork:true,fetchImpl,maxRetries:0});
  const response=await transport.get({kind:"contratacao",method:"GET",path:`/v1/orgaos/${target.cnpj}/compras/2026/7`,baseUrl:PNCP_PRODUCTION_BASE_URL,publicAccess:true,authenticationRequired:false});
  assert.equal(seen.url,`https://pncp.gov.br/api/pncp/v1/orgaos/${target.cnpj}/compras/2026/7`);
  assert.equal(seen.init.method,"GET");
  assert.equal(seen.init.redirect,"manual");
  assert.equal(Object.keys(seen.init.headers).some(key=>key.toLowerCase()==="authorization"),false);
  assert.equal(new TextDecoder().decode(response.bytes),'{"ok":true}');
  assert.match(response.sha256,/^[a-f0-9]{64}$/);
});

test("PNCP C1 falha fechado quando resposta excede limite",async()=>{
  const fetchImpl=async()=>new Response("1234567890",{status:200,headers:{"content-type":"application/json","content-length":"10"}});
  const transport=createPncpHttpTransport({allowNetwork:true,fetchImpl,maxBytes:5,maxRetries:0});
  await assert.rejects(transport.get({kind:"contratacao",method:"GET",path:"/v1/teste",baseUrl:PNCP_PRODUCTION_BASE_URL,publicAccess:true,authenticationRequired:false}),/excede 5 bytes/);
});

test("PNCP C1 coleta snapshot completo por fixture sem usar rede",async()=>{
  const snapshot=await collectPncpSnapshot(target,{transport:createFixtureTransport(fixtures())});
  assert.equal(snapshot.format,"arca-pncp-public-snapshot-v1");
  assert.equal(snapshot.networkUsed,false);
  assert.equal(snapshot.bundle.itens.length,2);
  assert.equal(snapshot.bundle.resultados.length,2);
  assert.equal(snapshot.bundle.contratos.length,1);
  assert.equal(snapshot.bundle.fontesOrcamentarias.length,1);
  assert.ok(snapshot.responses.length>=6);
});

test("PNCP C1 recurso opcional ausente permanece ausente",async()=>{
  const data=fixtures();delete data.contratos;delete data["fontes-orcamentarias"];
  const snapshot=await collectPncpSnapshot(target,{transport:createFixtureTransport(data)});
  assert.deepEqual(snapshot.bundle.contratos,[]);
  assert.deepEqual(snapshot.bundle.fontesOrcamentarias,[]);
});

test("PNCP C1 captura preserva bytes recebidos e produz proposta revisavel",async t=>{
  const root=await mkdtemp(join(tmpdir(),"arca-pncp-c1-"));t.after(()=>rm(root,{recursive:true,force:true}));
  const response=await createFixtureTransport({contratacao:fixtures().contratacao}).get({kind:"contratacao",method:"GET",path:"/v1/fixture",publicAccess:true,authenticationRequired:false});
  const captured=await capturePncpResponse({response,investigationId:"INV-PNCP-C1-TEST",sourceId:"SRC-PNCP-PUBLIC",actor:{id:"connector-test",role:"authorized-adapter"},stagingRoot:join(root,"staging"),custodyHome:join(root,"custody")});
  assert.equal(captured.manifest.original.originalSha256,response.sha256);
  assert.equal(captured.manifest.original.access.basis,"public");
  assert.equal(captured.proposal.humanReviewRequired,true);
  const originalPath=join(captured.root,captured.manifest.original.originalRelativePath);
  assert.equal(new TextDecoder().decode(await readFile(originalPath)),new TextDecoder().decode(response.bytes));
});

test("PNCP C1 snapshot so libera analise quando todas respostas OK foram capturadas",async t=>{
  const root=await mkdtemp(join(tmpdir(),"arca-pncp-snapshot-"));t.after(()=>rm(root,{recursive:true,force:true}));
  const snapshot=await collectPncpSnapshot(target,{transport:createFixtureTransport(fixtures())});
  const captured=await capturePncpSnapshotResponses(snapshot,{investigationId:"INV-PNCP-C1-SNAPSHOT",sourceId:"SRC-PNCP-PUBLIC",actor:{id:"connector-test",role:"authorized-adapter"},stagingRoot:join(root,"staging"),custodyHome:join(root,"custody")});
  assert.equal(captured.analysisMayProceed,true);
  assert.equal(captured.capturedCount,snapshot.responses.filter(entry=>entry.response.ok).length);
  assert.ok(captured.captures.every(item=>item.proposal.humanReviewRequired===true));
});

test("PNCP normalizacao preserva CNPJ alfanumerico",()=>{
  const record=normalizeProcurementRecord({procurementId:"PROC-ALFA",supplierCnpj:"00.000.000/E08G-12",supplierName:"Fornecedor Alfa",amount:100,participantCount:1});
  assert.equal(record.supplierCnpj,"00000000E08G12");
  const [pncp]=normalizePncpBundle({contratacao:{numeroControlePNCP:"00000000E08G12-1-000001/2026",processo:"1/2026"},resultados:[{niFornecedor:"00.000.000/E08G-12",nomeRazaoSocialFornecedor:"Fornecedor Alfa"}],contratos:[{numeroControlePNCPCompra:"00000000E08G12-1-000001/2026",valorInicial:100}],termos:[]});
  assert.equal(pncp.supplierCnpj,"00000000E08G12");
});
