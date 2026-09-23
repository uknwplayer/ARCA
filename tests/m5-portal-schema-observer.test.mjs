import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  observePortalJsonSchema,
  verifyPortalSchemaObservation,
  reviewPortalObservedSchema
} from "../src/investigation/m5-portal-schema-observer.mjs";

const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
function binding(bytes){
  return {
    source:"PORTAL",
    scopeSha256:"1".repeat(64),
    custodyEnvelopeSha256:"2".repeat(64),
    custodyReceiptSha256:"3".repeat(64),
    responseBytesSha256:sha256(bytes)
  };
}

test("M5-C observa somente estrutura, sem valores do Portal",()=>{
  const bytes=Buffer.from(JSON.stringify([
    {documento:"SEGREDO-DOC-001",fase:"3",valor:"10,00",favorecido:"PESSOA-SINTETICA"},
    {documento:"SEGREDO-DOC-002",fase:"3",valor:null}
  ]));
  const observation=observePortalJsonSchema({
    bytes,custodyBinding:binding(bytes),sourceCaptureNetworkUsed:true
  });
  assert.equal(observation.observationState,"SCHEMA_OBSERVED");
  assert.equal(observation.structure.rootType,"array");
  assert.equal(observation.structure.recordCount,2);
  assert.deepEqual(
    observation.structure.fields.map(item=>item.name),
    ["documento","fase","favorecido","valor"]
  );
  assert.deepEqual(
    observation.structure.fields.find(item=>item.name==="valor").types,
    ["null","string"]
  );
  assert.equal(observation.valuesIncluded,false);
  assert.equal(observation.rawBytesIncluded,false);
  assert.equal(observation.normalizationPerformed,false);
  assert.equal(observation.parserAdmitted,false);
  assert.equal(observation.observerNetworkUsed,false);
  assert.equal(observation.sourceCaptureNetworkUsed,true);
  const serialized=JSON.stringify(observation);
  assert.equal(serialized.includes("SEGREDO-DOC-001"),false);
  assert.equal(serialized.includes("PESSOA-SINTETICA"),false);
  assert.equal(serialized.includes("10,00"),false);
});

test("M5-C é determinístico e vinculado aos bytes e à custódia",()=>{
  const bytes=Buffer.from(JSON.stringify([{a:"x",b:1},{a:"y",b:2}]));
  const one=observePortalJsonSchema({bytes,custodyBinding:binding(bytes)});
  const two=observePortalJsonSchema({bytes,custodyBinding:binding(bytes)});
  assert.equal(one.observationSha256,two.observationSha256);
  assert.equal(one.observedSchemaSha256,two.observedSchemaSha256);
  assert.equal(
    verifyPortalSchemaObservation({observation:one,bytes,custodyBinding:binding(bytes)}).observationSha256,
    one.observationSha256
  );
  const wrong={...binding(bytes),responseBytesSha256:"f".repeat(64)};
  assert.throws(()=>observePortalJsonSchema({bytes,custodyBinding:wrong}),/RESPONSE_HASH_MISMATCH/);
});

test("M5-C registra schema inesperado sem admitir parser automaticamente",()=>{
  const bytes=Buffer.from(JSON.stringify([{campoNovo:"valor-privado",objeto:{x:1}}]));
  const observation=observePortalJsonSchema({bytes,custodyBinding:binding(bytes)});
  assert.equal(observation.observationState,"SCHEMA_OBSERVED");
  assert.equal(observation.parserAdmitted,false);
  assert.deepEqual(
    observation.structure.fields.find(item=>item.name==="objeto").types,
    ["object"]
  );
  const review=reviewPortalObservedSchema({
    observation,
    reviewedObservationSha256:observation.observationSha256,
    decision:"APPROVE_FOR_PARSER_DESIGN",
    reviewerRef:"human-review:synthetic",
    reviewedAt:"2026-09-23T12:00:00.000Z"
  });
  assert.equal(review.decision,"APPROVE_FOR_PARSER_DESIGN");
  assert.equal(review.parserImplementationAuthorized,false);
  assert.equal(review.normalizationAuthorized,false);
  assert.equal(review.networkAuthorized,false);
  assert.equal(review.publicationAuthorized,false);
});

test("M5-C marca raiz incompatível como drift e recusa aprovação para parser",()=>{
  const bytes=Buffer.from(JSON.stringify({documento:"nao-e-array"}));
  const observation=observePortalJsonSchema({bytes,custodyBinding:binding(bytes)});
  assert.equal(observation.observationState,"SCHEMA_DRIFT_REVIEW_REQUIRED");
  assert.equal(observation.structure.rootType,"object");
  assert.throws(()=>reviewPortalObservedSchema({
    observation,
    reviewedObservationSha256:observation.observationSha256,
    decision:"APPROVE_FOR_PARSER_DESIGN",
    reviewerRef:"human-review:synthetic",
    reviewedAt:"2026-09-23T12:00:00.000Z"
  }),/DRIFT_CANNOT_BE_APPROVED/);
});

test("M5-C preserva limite de registros como drift estrutural",()=>{
  const bytes=Buffer.from(JSON.stringify(Array.from({length:26},(_,i)=>({campo:String(i)}))));
  const observation=observePortalJsonSchema({bytes,custodyBinding:binding(bytes)});
  assert.equal(observation.observationState,"SCHEMA_DRIFT_REVIEW_REQUIRED");
  assert.equal(observation.structure.recordCount,26);
  assert.equal(observation.structure.budgetExceeded,true);
  assert.equal(JSON.stringify(observation).includes('"campo":"0"'),false);
});

test("M5-C rejeita UTF-8 e JSON inválidos sem fabricar schema",()=>{
  const utf8=Buffer.from([0xc3,0x28]);
  assert.throws(()=>observePortalJsonSchema({bytes:utf8,custodyBinding:binding(utf8)}),/UTF8_INVALID/);
  const json=Buffer.from("nao-json");
  assert.throws(()=>observePortalJsonSchema({bytes:json,custodyBinding:binding(json)}),/JSON_INVALID/);
});
