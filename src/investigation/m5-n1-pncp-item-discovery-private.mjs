import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {openCustodyEnvelope} from "../machine-bridge/encrypted-custody-envelope.mjs";
import {buildM5PncpLiveNormalizedBinding} from "./m5-pncp-live-normalized-binding.mjs";
import {buildM5N1ItemDiscoveryPlan,buildM5N1ItemDiscoveryCandidate} from "./m5-n1-pncp-item-discovery-plan.mjs";

const envelopeHash=e=>sha256(JSON.stringify(e));
function readBinding(input){const doc={...input};delete doc.schema;return buildM5PncpLiveNormalizedBinding(doc)}
function openPrivate(envelope,passphrase){
  const payload=openCustodyEnvelope({envelope,passphrase});
  if(!Array.isArray(payload.files)||payload.files.length!==1||payload.files[0].path!=="normalized-private.json")
    throw new Error("ARCA_M5_N1_PRIVATE_PAYLOAD_INVALID");
  try{return JSON.parse(Buffer.from(payload.files[0].data,"base64").toString("utf8"))}
  catch{throw new Error("ARCA_M5_N1_PRIVATE_JSON_INVALID")}
}
function records(doc,binding){
  if(doc?.schema!=="arca.m5-pncp-custodial-normalization.v1"||
     !Array.isArray(doc.records)||doc.records.length!==doc.recordCount||
     doc.recordCount!==binding.normalization.recordCount)
    throw new Error("ARCA_M5_N1_PRIVATE_DOC_INVALID");
  const {normalizationSha256,sourceCaptureRunId,...body}=doc;
  if(sha256(canonicalJson(body))!==normalizationSha256||
     normalizationSha256!==binding.normalization.normalizationSha256)
    throw new Error("ARCA_M5_N1_NORMALIZATION_HASH_MISMATCH");
  return doc.records;
}

export function deriveM5N1ItemDiscovery({
  envelope,passphrase,pncpBindingInput,expectedEnvelopeSha256,
  screeningSha256,m5mDiagnosisSha256,revision
}={}){
  const binding=readBinding(pncpBindingInput);
  if(envelopeHash(envelope)!==expectedEnvelopeSha256||
     expectedEnvelopeSha256!==binding.normalization.normalizedEnvelopeSha256)
    throw new Error("ARCA_M5_N1_ENVELOPE_HASH_MISMATCH");
  const plan=buildM5N1ItemDiscoveryPlan({records:records(openPrivate(envelope,passphrase),binding)});
  const candidate=buildM5N1ItemDiscoveryCandidate({
    plan,revision,pncpBindingSha256:binding.bindingSha256,
    screeningSha256,m5mDiagnosisSha256
  });
  return Object.freeze({binding,plan,candidate});
}
