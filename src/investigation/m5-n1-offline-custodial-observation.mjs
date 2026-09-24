import {createHash} from "node:crypto";
import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {openCustodyEnvelope} from "../machine-bridge/encrypted-custody-envelope.mjs";
import {observeM5N1ItemsResponse} from "./m5-n1-pncp-item-response.mjs";

export const M5_N1_OFFLINE_OBSERVATION_SCHEMA="arca.m5-n1-offline-observation.v1";
const H64=/^[a-f0-9]{64}$/;
const hashBytes=b=>createHash("sha256").update(b).digest("hex");
const h64=(v,c)=>{const o=String(v??"").trim().toLowerCase();if(!H64.test(o))throw new Error(c);return o};

export function observeM5N1CustodialEnvelope({
  envelope,
  passphrase,
  expectedEnvelopeSha256,
  expectedCandidateSha256,
  expectedPlanSha256,
  expectedTargets,
  pageSize=10
}={}){
  const envelopeHash=sha256(JSON.stringify(envelope));
  if(envelopeHash!==h64(expectedEnvelopeSha256,"ARCA_M5_N1_OFFLINE_ENVELOPE_HASH_INVALID"))
    throw new Error("ARCA_M5_N1_OFFLINE_ENVELOPE_HASH_MISMATCH");
  if(!Array.isArray(expectedTargets)||expectedTargets.length!==2)
    throw new Error("ARCA_M5_N1_OFFLINE_TARGETS_INVALID");

  const payload=openCustodyEnvelope({envelope,passphrase});
  if(!Array.isArray(payload.files)||payload.files.length!==3)
    throw new Error("ARCA_M5_N1_OFFLINE_FILE_COUNT_INVALID");
  const byName=new Map(payload.files.map(x=>[x.path,x]));
  const metaFile=byName.get("capture-meta.json");
  if(!metaFile)throw new Error("ARCA_M5_N1_OFFLINE_META_MISSING");

  let meta;
  try{meta=JSON.parse(Buffer.from(metaFile.data,"base64").toString("utf8"))}
  catch{throw new Error("ARCA_M5_N1_OFFLINE_META_INVALID")}

  const candidate=h64(expectedCandidateSha256,"ARCA_M5_N1_OFFLINE_CANDIDATE_INVALID");
  const plan=h64(expectedPlanSha256,"ARCA_M5_N1_OFFLINE_PLAN_INVALID");
  if(meta?.candidateSha256!==candidate||meta?.planSha256!==plan||
     !Array.isArray(meta.responses)||meta.responses.length!==2)
    throw new Error("ARCA_M5_N1_OFFLINE_META_BINDING_INVALID");

  const observations=expectedTargets.map((target,index)=>{
    const targetSha256=h64(target.targetSha256,"ARCA_M5_N1_OFFLINE_TARGET_INVALID");
    const fileName=String(target.fileName??"");
    if(!/^items-[12]-[a-f0-9]{12}\.bin$/.test(fileName))
      throw new Error("ARCA_M5_N1_OFFLINE_FILENAME_INVALID");
    const file=byName.get(fileName);
    if(!file)throw new Error("ARCA_M5_N1_OFFLINE_RESPONSE_MISSING");
    const mr=meta.responses[index];
    if(mr?.targetSha256!==targetSha256||mr?.httpStatus!==200||
       !H64.test(mr?.responseBytesSha256??""))
      throw new Error("ARCA_M5_N1_OFFLINE_RESPONSE_META_INVALID");
    const bytes=Buffer.from(file.data,"base64");
    if(hashBytes(bytes)!==mr.responseBytesSha256)
      throw new Error("ARCA_M5_N1_OFFLINE_RESPONSE_HASH_MISMATCH");
    const observed=observeM5N1ItemsResponse({
      bytes,httpStatus:200,targetSha256,pageSize
    });
    return Object.freeze({
      targetSha256,
      responseBytesSha256:mr.responseBytesSha256,
      responseShape:observed.responseShape,
      itemCount:observed.itemCount,
      itemsWithResultCount:observed.itemsWithResultCount,
      pagePossiblyTruncated:observed.pagePossiblyTruncated,
      resultItemSetSha256:observed.resultItemSetSha256,
      nextStageReady:observed.nextStageReady
    });
  });

  const totalItems=observations.reduce((a,x)=>a+x.itemCount,0);
  const totalItemsWithResult=observations.reduce((a,x)=>a+x.itemsWithResultCount,0);
  const coverageComplete=observations.every(x=>!x.pagePossiblyTruncated);
  const base={
    schema:M5_N1_OFFLINE_OBSERVATION_SCHEMA,
    version:1,
    source:"PNCP",
    sourceLiveRunId:"36051395397",
    candidateSha256:candidate,
    planSha256:plan,
    custodyEnvelopeSha256:envelopeHash,
    pageSize,
    targetCount:2,
    observations:Object.freeze(observations),
    totalItems,
    totalItemsWithResult,
    coverageComplete,
    m5n2PreparationAllowed:coverageComplete&&totalItemsWithResult>0,
    sourceRequestCount:0,
    sourceNetworkUsed:false,
    publicationAttempted:false,
    correlationAttempted:false,
    supplierInferenceAttempted:false,
    rawValuesIncluded:false,
    humanReviewRequired:true,
    adverseFinding:false
  };
  return Object.freeze({...base,observationSha256:sha256(canonicalJson(base))});
}
