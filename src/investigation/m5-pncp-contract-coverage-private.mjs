import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {openCustodyEnvelope} from "../machine-bridge/encrypted-custody-envelope.mjs";
import {buildM5PncpLiveNormalizedBinding} from "./m5-pncp-live-normalized-binding.mjs";
import {
  buildM5PncpContractCoveragePlan,
  buildM5PncpContractCoverageCandidate
} from "./m5-pncp-contract-coverage-plan.mjs";

function envelopeHash(envelope){return sha256(JSON.stringify(envelope))}
function exactPrivateFile(envelope,passphrase){
  const payload=openCustodyEnvelope({envelope,passphrase});
  if(!Array.isArray(payload.files)||payload.files.length!==1||
     payload.files[0].path!=="normalized-private.json")
    throw new Error("ARCA_M5_M_PRIVATE_PAYLOAD_INVALID");
  let doc;
  try{doc=JSON.parse(Buffer.from(payload.files[0].data,"base64").toString("utf8"))}
  catch{throw new Error("ARCA_M5_M_PRIVATE_JSON_INVALID")}
  return doc;
}
function validatePncpDoc(doc,binding){
  if(doc?.schema!=="arca.m5-pncp-custodial-normalization.v1"||
     !Array.isArray(doc.records)||doc.records.length!==doc.recordCount||
     doc.recordCount!==binding.normalization.recordCount)
    throw new Error("ARCA_M5_M_PNCP_PRIVATE_DOC_INVALID");
  const {normalizationSha256,sourceCaptureRunId,...body}=doc;
  if(sha256(canonicalJson(body))!==normalizationSha256||
     normalizationSha256!==binding.normalization.normalizationSha256)
    throw new Error("ARCA_M5_M_PNCP_NORMALIZATION_HASH_MISMATCH");
  return doc.records;
}
function readBinding(input){
  const doc={...input}; delete doc.schema;
  return buildM5PncpLiveNormalizedBinding(doc);
}

export function deriveM5PncpContractCoverage({
  envelope,
  passphrase,
  pncpBindingInput,
  expectedEnvelopeSha256,
  screeningSha256,
  revision
}={}){
  const binding=readBinding(pncpBindingInput);
  if(envelopeHash(envelope)!==expectedEnvelopeSha256||
     expectedEnvelopeSha256!==binding.normalization.normalizedEnvelopeSha256)
    throw new Error("ARCA_M5_M_ENVELOPE_HASH_MISMATCH");
  const records=validatePncpDoc(exactPrivateFile(envelope,passphrase),binding);
  const plan=buildM5PncpContractCoveragePlan({records});
  const candidate=buildM5PncpContractCoverageCandidate({
    plan,
    revision,
    pncpBindingSha256:binding.bindingSha256,
    screeningSha256
  });
  return Object.freeze({binding,plan,candidate});
}
