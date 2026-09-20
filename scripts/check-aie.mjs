import assert from "node:assert/strict";
import {access,readFile} from "node:fs/promises";
import {createDefaultActionRegistry} from "../src/machine-bridge/action-registry.mjs";

const required=[
  "docs/ARCA_AIE_CORE_v0.4.0.md",
  "packages/aie/package.json",
  "packages/aie/src/index.ts",
  "packages/aie/src/engine.ts",
  "packages/aie/src/procurement.ts",
  "schemas/arca-aie-baseline-v1.schema.json",
  "schemas/arca-aie-detector-v1.schema.json",
  "schemas/arca-aie-finding-v1.schema.json",
  "schemas/arca-aie-procurement-record-v1.schema.json",
  "tests/aie.test.mjs",
  "tests/aie-machine-bridge.test.mjs",
  "tests/aie-procurement.test.mjs",
  "tests/aie-procurement-machine-bridge.test.mjs",
  "examples/aie-fixtures/procurement-risk.json",
  "examples/aie-fixtures/procurement-normal.json"
];
for(const path of required)await access(path);
for(const path of required.filter(path=>path.endsWith(".json")))JSON.parse(await readFile(path,"utf8"));

const pkg=JSON.parse(await readFile("packages/aie/package.json","utf8"));
assert.equal(pkg.name,"@arca/aie");
assert.equal(pkg.version,"0.4.0");
const lock=JSON.parse(await readFile("package-lock.json","utf8"));
assert.equal(lock.packages["node_modules/@arca/aie"]?.resolved,"packages/aie");
assert.equal(lock.packages["packages/aie"]?.version,"0.4.0");

const worker={format:"arca-worker-v1",workerId:"check-aie",capabilities:["aie"],heartbeatAt:new Date(0).toISOString()};
const registry=createDefaultActionRegistry({worker});
for(const actionName of ["aie.analyze","aie.procurement-profile"]){
  const action=registry.get(actionName);
  assert.ok(action,`${actionName} must be registered`);
  assert.deepEqual(action.requires,["aie"]);
}

const findingSchema=JSON.parse(await readFile("schemas/arca-aie-finding-v1.schema.json","utf8"));
assert.equal(findingSchema.properties.humanReviewRequired.const,true);
assert.deepEqual(findingSchema.properties.triage.enum,["discarded","weak","review","investigate","blocked","data-error"]);
const procurementSchema=JSON.parse(await readFile("schemas/arca-aie-procurement-record-v1.schema.json","utf8"));
assert.equal(procurementSchema.properties.format.const,"arca-aie-procurement-record-v1");
assert.equal(procurementSchema.properties.normalization.properties.method.const,"public-procurement-normalizer-v1");

const doc=await readFile("docs/ARCA_AIE_CORE_v0.4.0.md","utf8");
assert.match(doc,/PNCP.*não portado|não portado.*PNCP/is);
assert.match(doc,/não.*declara culpa, crime, fraude ou irregularidade jurídica/i);
assert.match(doc,/normaliza.*contratações|normalização.*contratações/i);

process.stdout.write(JSON.stringify({ok:true,requiredFiles:required.length,package:pkg.name,version:pkg.version,actions:["aie.analyze","aie.procurement-profile"],humanReviewRequired:true,networkAcquisition:false})+"\n");
