import test from "node:test";
import assert from "node:assert/strict";
import {createResolver,EvidenceState} from "../src/aie/public-source-resolver.mjs";
import {municipalityAdapters,registerMunicipalityAdapter,getMunicipalityAdapter} from "../src/aie/adapters/municipality-registry.mjs";
import {pncpPublicAdapter} from "../src/aie/adapters/pncp-public.mjs";

test("resolver preserves source conflict instead of choosing a convenient fact",async()=>{
  const resolver=createResolver({adapters:[
    {id:"a",priority:1,async resolve(){return {facts:[{field:"supplierName",value:"A",state:EvidenceState.OBSERVED}]}}},
    {id:"b",priority:2,async resolve(){return {facts:[{field:"supplierName",value:"B",state:EvidenceState.RESOLVED_ELSEWHERE}]}}}
  ]});
  const out=await resolver.resolve({target:{id:"synthetic"}});
  assert.equal(out.resolved.supplierName.state,EvidenceState.CONFLICT);
  assert.equal(out.resolved.supplierName.values.length,2);
});

test("PNCP adapter emits only supplied public facts with provenance",async()=>{
  const out=await pncpPublicAdapter.resolve({pncp:{supplierCnpj:"00000000000000",supplierName:"Fixture",participantCount:3,provenance:{locator:"https://pncp.gov.br/example"}}});
  assert.equal(out.state,EvidenceState.OBSERVED);
  assert.equal(out.facts.length,3);
  assert.ok(out.facts.every(f=>f.provenance.locator==="https://pncp.gov.br/example"));
});

test("municipality registry validates IBGE keys",()=>{
  municipalityAdapters.clear();
  const synthetic={id:"municipality:synthetic"};
  registerMunicipalityAdapter("9999999",synthetic);
  assert.equal(getMunicipalityAdapter("9999999"),synthetic);
  assert.throws(()=>registerMunicipalityAdapter("bad",{}),/invalid IBGE/);
});

