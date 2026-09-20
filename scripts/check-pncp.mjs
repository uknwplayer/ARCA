import assert from "node:assert/strict";
import {access,readFile} from "node:fs/promises";
import {createDefaultActionRegistry} from "../src/machine-bridge/action-registry.mjs";
import {buildPncpProcurementRequestPlan,PNCP_PRODUCTION_BASE_URL} from "../packages/pncp-connector/src/index.ts";
import {buildPncpConsultaUrl,PNCP_CONSULTA_BASE_URL} from "../packages/pncp-connector/src/discovery.ts";

const publicProfile=process.argv.includes("--public");

const required=[
  "docs/ARCA_PNCP_C1_V3.md",
  "docs/ARCA_PNCP_C2_DISCOVERY_V3.md",
  "packages/pncp-connector/package.json",
  "packages/pncp-connector/src/index.ts",
  "packages/pncp-connector/src/network-custody.ts",
  "packages/pncp-connector/src/discovery.ts",
  "packages/aie/src/pncp.ts",
  "src/machine-bridge/pncp-discovery-actions.mjs",
  "tests/pncp-connector-c1.test.mjs",
  "tests/pncp-machine-bridge.test.mjs",
  "tests/pncp-network-custody.test.mjs",
  "tests/pncp-discovery-v2.test.mjs",
  "tests/pncp-discovery-machine-bridge.test.mjs"
];
for(const path of required)await access(path);

const pkg=JSON.parse(await readFile("packages/pncp-connector/package.json","utf8"));
assert.equal(pkg.name,"@arca/pncp-connector");
const lock=JSON.parse(await readFile("package-lock.json","utf8"));
assert.equal(lock.packages["node_modules/@arca/pncp-connector"]?.resolved,"packages/pncp-connector");
assert.equal(lock.packages["packages/pncp-connector"]?.version,"0.4.0");
assert.equal(PNCP_PRODUCTION_BASE_URL,"https://pncp.gov.br/api/pncp");
assert.equal(PNCP_CONSULTA_BASE_URL,"https://pncp.gov.br/api/consulta");

const plan=buildPncpProcurementRequestPlan({cnpj:"12345678000195",ano:2026,sequencial:7});
assert.equal(plan.networkAllowedByPlan,false);
assert.equal(plan.humanAuthorizationRequiredForNetwork,true);
assert.ok(plan.requests.every(item=>item.method==="GET"&&item.authenticationRequired===false&&item.baseUrl===PNCP_PRODUCTION_BASE_URL));

const discoveryUrl=new URL(buildPncpConsultaUrl("/v1/contratacoes/publicacao",{dataInicial:"20260901",dataFinal:"20260902",codigoModalidadeContratacao:6,uf:"SP",pagina:1,tamanhoPagina:100}));
assert.equal(discoveryUrl.origin,"https://pncp.gov.br");
assert.equal(discoveryUrl.pathname,"/api/consulta/v1/contratacoes/publicacao");
assert.equal(discoveryUrl.searchParams.get("codigoModalidadeContratacao"),"6");

const planWorker={format:"arca-worker-v1",workerId:"check-pncp",capabilities:["pncp-plan"],heartbeatAt:new Date(0).toISOString()};
const defaultRegistry=createDefaultActionRegistry({worker:planWorker});
assert.deepEqual(defaultRegistry.get("pncp.plan")?.requires,["pncp-plan"]);
assert.deepEqual(defaultRegistry.get("pncp.discovery-plan")?.requires,["pncp-plan"]);
assert.equal(defaultRegistry.get("pncp.acquire-public"),null);
assert.equal(defaultRegistry.get("pncp.discovery-public"),null);
assert.equal(defaultRegistry.get("pncp.fetch"),null);

const networkWorker={...planWorker,workerId:"check-pncp-network",capabilities:["pncp-public-network"]};
const networkRegistry=createDefaultActionRegistry({worker:networkWorker,pncpNetwork:{enabled:true,custodyHome:"/tmp/arca-pncp-custody-check",stagingRoot:"/tmp/arca-pncp-staging-check"}});
assert.deepEqual(networkRegistry.get("pncp.acquire-public")?.requires,["pncp-public-network"]);
assert.deepEqual(networkRegistry.get("pncp.discovery-public")?.requires,["pncp-public-network"]);

if(!publicProfile){
  const workflow=await readFile(".github/workflows/arca-machine-bridge.yml","utf8");
  assert.match(workflow,/pncp-plan/);
  assert.doesNotMatch(workflow,/pncp-public-network/);
  assert.doesNotMatch(workflow,/ARCA_PNCP_PUBLIC_NETWORK_ENABLED/);
}
const connector=await readFile("packages/pncp-connector/src/index.ts","utf8");
assert.doesNotMatch(connector,/pncp\.gov\.br\/api\/consulta/);
assert.match(connector,/allowNetwork===true/);
const discovery=await readFile("packages/pncp-connector/src/discovery.ts","utf8");
assert.match(discovery,/https:\/\/pncp\.gov\.br\/api\/consulta/);
assert.match(discovery,/\/v1\/contratacoes\/publicacao/);
assert.match(discovery,/custodyRequiredBeforeParsing:true/);
const agent=await readFile("scripts/arca-worker-agent.mjs","utf8");
assert.match(agent,/ARCA_PNCP_PUBLIC_NETWORK_ENABLED/);
assert.match(agent,/ARCA_PNCP_CUSTODY_HOME/);
assert.match(agent,/ARCA_PNCP_STAGING_ROOT/);

process.stdout.write(JSON.stringify({ok:true,package:pkg.name,version:pkg.version,planActions:["pncp.plan","pncp.discovery-plan"],localNetworkActions:["pncp.acquire-public","pncp.discovery-public"],detailBaseUrl:PNCP_PRODUCTION_BASE_URL,discoveryBaseUrl:PNCP_CONSULTA_BASE_URL,canonicalWorkerNetworkCapability:false,canonicalWorkerNetworkEnabled:false,distributionProfile:publicProfile?"public":"engineering"})+"\n");
