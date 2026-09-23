import {createHash} from "node:crypto";
import {
  observePortalJsonSchema,
  reviewPortalObservedSchema
} from "../src/investigation/m5-portal-schema-observer.mjs";

const bytes=Buffer.from(JSON.stringify([
  {documento:"NAO-DEVE-VAZAR",fase:"3",valor:"10,00"},
  {documento:"TAMBEM-NAO",fase:"3",valor:null}
]));
const sha256=value=>createHash("sha256").update(value).digest("hex");
const observation=observePortalJsonSchema({
  bytes,
  custodyBinding:{
    source:"PORTAL",
    scopeSha256:"1".repeat(64),
    custodyEnvelopeSha256:"2".repeat(64),
    custodyReceiptSha256:"3".repeat(64),
    responseBytesSha256:sha256(bytes)
  },
  sourceCaptureNetworkUsed:false
});
const review=reviewPortalObservedSchema({
  observation,
  reviewedObservationSha256:observation.observationSha256,
  decision:"APPROVE_FOR_PARSER_DESIGN",
  reviewerRef:"human-review:synthetic-validator",
  reviewedAt:"2026-09-23T12:00:00.000Z"
});
const serialized=JSON.stringify(observation);
if(observation.observationState!=="SCHEMA_OBSERVED"||
   observation.valuesIncluded!==false||
   observation.rawBytesIncluded!==false||
   observation.normalizationPerformed!==false||
   observation.parserAdmitted!==false||
   observation.observerNetworkUsed!==false||
   serialized.includes("NAO-DEVE-VAZAR")||
   serialized.includes("TAMBEM-NAO")||
   serialized.includes("10,00")||
   review.parserImplementationAuthorized!==false||
   review.normalizationAuthorized!==false)
  throw new Error("ARCA_M5_PHASE_C_VALIDATION_FAILED");

console.log(JSON.stringify({
  status:"PASS",
  phase:"M5-C",
  observationState:observation.observationState,
  observedSchemaSha256:observation.observedSchemaSha256,
  observationSha256:observation.observationSha256,
  fieldCount:observation.structure.fields.length,
  valuesIncluded:observation.valuesIncluded,
  normalizationPerformed:observation.normalizationPerformed,
  parserImplementationAuthorized:review.parserImplementationAuthorized
},null,2));
