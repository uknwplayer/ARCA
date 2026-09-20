import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  PNCP_CONSULTA_BASE_URL,
  buildPncpConsultaUrl,
  buildPncpDiscoveryPlan,
  createPncpConsultaFixtureTransport,
  createPncpConsultaHttpTransport,
  runPncpBoundedDiscovery,
  validatePncpDiscoveryScope
} from "../packages/pncp-connector/src/discovery.ts";

const municipalityScope={codigoMunicipioIbge:"3505708",uf:"SP",dataInicial:"20260901",dataFinal:"20260903"};
const cnpjScope={cnpj:"12345678000195",dataInicial:"20260901",dataFinal:"20260903"};

function entry(control,extras={}){
  return {numeroControlePNCP:control,objetoCompra:extras.objetoCompra??"Aquisicao sintetica",modalidadeId:extras.modalidadeId??6,modalidadeNome:extras.modalidadeNome??"Pregao",dataPublicacaoPncp:"2026-09-01T12:00:00Z",valorTotalEstimado:extras.valorTotalEstimado??100,...extras};
}
async function context(t,extra={}){
  const root=await mkdtemp(join(tmpdir(),"arca-pncp-discovery-"));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {investigationId:"INV-PNCP-DISCOVERY-TEST",sourceId:"SRC-PNCP-CONSULTA",actor:{id:"discovery-test",role:"authorized-adapter"},custodyHome:join(root,"custody"),stagingRoot:join(root,"staging"),...extra};
}

test("C2 validates bounded municipality and CNPJ scopes",()=>{
  assert.deepEqual(validatePncpDiscoveryScope(municipalityScope),{cnpj:null,codigoMunicipioIbge:"3505708",uf:"SP",dataInicial:"20260901",dataFinal:"20260903",inclusiveDays:3});
  assert.equal(validatePncpDiscoveryScope(cnpjScope).cnpj,"12345678000195");
  assert.throws(()=>validatePncpDiscoveryScope({dataInicial:"20260901",dataFinal:"20260903"}),/exige ao menos/);
  assert.throws(()=>validatePncpDiscoveryScope({...municipalityScope,dataFinal:"20261015"}),/intervalo excede/);
});

test("C2 Consulta URL is fixed to the official public publication endpoint",()=>{
  assert.equal(PNCP_CONSULTA_BASE_URL,"https://pncp.gov.br/api/consulta");
  const url=buildPncpConsultaUrl("/v1/contratacoes/publicacao",{dataInicial:"20260901",dataFinal:"20260903",codigoModalidadeContratacao:6,codigoMunicipioIbge:"3505708",uf:"SP",pagina:1,tamanhoPagina:100});
  const parsed=new URL(url);
  assert.equal(parsed.origin,"https://pncp.gov.br");
  assert.equal(parsed.pathname,"/api/consulta/v1/contratacoes/publicacao");
  assert.equal(parsed.searchParams.get("codigoMunicipioIbge"),"3505708");
  assert.throws(()=>buildPncpConsultaUrl("/v1/contratos",{}),/nao allowlisted/);
  assert.throws(()=>buildPncpConsultaUrl("/v1/contratacoes/publicacao",{redirect:"https://example.org"}),/parametro.*nao allowlisted/);
  assert.throws(()=>buildPncpConsultaUrl("/v1/contratacoes/publicacao",{},"https://example.org/api/consulta"),/allowlist/);
});

test("C2 discovery plan fixes budgets before network access",()=>{
  const plan=buildPncpDiscoveryPlan({...municipalityScope,modalidadeIds:[8,6,6]},{maxPagesPerModality:2,maxTotalPages:3,maxRecords:20,pageSize:50});
  assert.deepEqual(plan.modalidadeIds,[6,8]);
  assert.deepEqual(plan.budgets,{maxPagesPerModality:2,maxTotalPages:3,maxRecords:20,pageSize:50});
  assert.equal(plan.networkDefault,"blocked");
  assert.equal(plan.custodyRequiredBeforeParsing,true);
  assert.equal(plan.firstPageRequests.length,2);
  assert.ok(plan.firstPageRequests.every(request=>request.method==="GET"&&request.authenticationRequired===false));
});

test("C2 real transport is blocked by default and never adds Authorization",async()=>{
  const blocked=createPncpConsultaHttpTransport({allowNetwork:false,maxRetries:0});
  await assert.rejects(()=>blocked.get({kind:"x",method:"GET",path:"/v1/contratacoes/publicacao",baseUrl:PNCP_CONSULTA_BASE_URL,query:{dataInicial:"20260901",dataFinal:"20260901",codigoModalidadeContratacao:6,uf:"SP",pagina:1},publicAccess:true,authenticationRequired:false}),/bloqueada/);
  let seen=null;
  const fetchImpl=async(url,init)=>{seen={url,init};return new Response(JSON.stringify({data:[],totalPaginas:1}),{status:200,headers:{"content-type":"application/json"}})};
  const transport=createPncpConsultaHttpTransport({allowNetwork:true,fetchImpl,maxRetries:0});
  const response=await transport.get({kind:"x",method:"GET",path:"/v1/contratacoes/publicacao",baseUrl:PNCP_CONSULTA_BASE_URL,query:{dataInicial:"20260901",dataFinal:"20260901",codigoModalidadeContratacao:6,uf:"SP",pagina:1},publicAccess:true,authenticationRequired:false});
  assert.equal(response.ok,true);
  assert.equal(seen.init.method,"GET");
  assert.equal(seen.init.redirect,"manual");
  assert.equal(Object.keys(seen.init.headers).some(key=>key.toLowerCase()==="authorization"),false);
});

test("C2 captures every page before parsing and deduplicates procurement targets",async t=>{
  const ctx=await context(t);
  const duplicate=entry("12345678000195-1-000007/2026");
  const fixtures={
    "discovery-modality-6-page-1":{data:[duplicate,entry("12345678000195-1-000008/2026")],totalPaginas:2,paginasRestantes:1},
    "discovery-modality-6-page-2":{data:[duplicate],totalPaginas:2,paginasRestantes:0},
    "discovery-modality-8-page-1":{data:[entry("12345678000195-1-000009/2026",{modalidadeId:8,modalidadeNome:"Dispensa"})],totalPaginas:1,paginasRestantes:0}
  };
  const result=await runPncpBoundedDiscovery({...municipalityScope,modalidadeIds:[6,8],...ctx},{transport:createPncpConsultaFixtureTransport(fixtures),maxPagesPerModality:3,maxTotalPages:10,maxRecords:100,pageSize:100});
  assert.equal(result.stats.pageRequests,3);
  assert.equal(result.stats.pagesCaptured,3);
  assert.equal(result.stats.rawRecordsSeen,4);
  assert.equal(result.stats.uniqueTargets,3);
  assert.equal(result.targets.length,3);
  assert.ok(result.pages.every(page=>page.acquisitionId&&/^[a-f0-9]{64}$/.test(page.sha256)));
  assert.ok(result.pages.every(page=>page.proposal.humanReviewRequired===true));
  assert.equal(result.invariants.custodyBeforeParsing,true);
  assert.equal(result.invariants.coreMutationPerformed,false);
});

test("C2 stops on global page budget",async t=>{
  const ctx=await context(t);
  const fixtures={
    "discovery-modality-6-page-1":{data:[entry("12345678000195-1-000001/2026")],totalPaginas:5,paginasRestantes:4},
    "discovery-modality-6-page-2":{data:[entry("12345678000195-1-000002/2026")],totalPaginas:5,paginasRestantes:3}
  };
  const result=await runPncpBoundedDiscovery({...cnpjScope,modalidadeIds:[6],...ctx},{transport:createPncpConsultaFixtureTransport(fixtures),maxPagesPerModality:10,maxTotalPages:2,maxRecords:100});
  assert.equal(result.stats.pageRequests,2);
  assert.equal(result.stats.uniqueTargets,2);
  assert.equal(result.stats.stoppedBy,"max-total-pages");
});

test("C2 ignores records without a deepen-able target instead of inventing IDs",async t=>{
  const ctx=await context(t);
  const fixtures={"discovery-modality-6-page-1":{data:[{objetoCompra:"Sem identificador"}],totalPaginas:1}};
  const result=await runPncpBoundedDiscovery({...cnpjScope,modalidadeIds:[6],...ctx},{transport:createPncpConsultaFixtureTransport(fixtures),maxPagesPerModality:2,maxTotalPages:2,maxRecords:10});
  assert.equal(result.stats.rawRecordsSeen,1);
  assert.equal(result.stats.uniqueTargets,0);
  assert.deepEqual(result.targets,[]);
});
