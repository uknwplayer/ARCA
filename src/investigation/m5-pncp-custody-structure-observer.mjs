import {createHash} from "node:crypto";
import {canonicalJson} from "./public-source-contract.mjs";
import {openCustodyEnvelope} from "../machine-bridge/encrypted-custody-envelope.mjs";

export const M5_PNCP_CUSTODY_STRUCTURE_SCHEMA="arca.m5-pncp-custody-structure-observation.v1";

const H64=/^[a-f0-9]{64}$/;
function sha256(value){return createHash("sha256").update(value).digest("hex")}
function h64(value,code){
  const out=String(value??"").trim().toLowerCase();
  if(!H64.test(out))throw new Error(code);
  return out;
}
function typeOf(value){
  if(value===null)return "null";
  if(Array.isArray(value))return "array";
  return typeof value==="object"?"object":typeof value;
}
function textKey(value){
  const out=String(value??"").normalize("NFKC").trim();
  if(!out||out.length>160||/[\u0000-\u001f\u007f]/u.test(out))
    throw new Error("ARCA_M5_PNCP_SCHEMA_FIELD_INVALID");
  return out;
}
function summarize(value,state,depth=0){
  state.nodes++;
  if(state.nodes>512)throw new Error("ARCA_M5_PNCP_SCHEMA_NODE_BUDGET_EXCEEDED");
  const type=typeOf(value);
  if(depth>=5)return Object.freeze({type,truncated:true});
  if(type==="object"){
    const entries=Object.entries(value);
    if(entries.length>128)throw new Error("ARCA_M5_PNCP_SCHEMA_FIELD_BUDGET_EXCEEDED");
    return Object.freeze({
      type:"object",
      fields:Object.freeze(entries
        .map(([name,item])=>Object.freeze({
          name:textKey(name),
          schema:summarize(item,state,depth+1)
        }))
        .sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")))
    });
  }
  if(type==="array"){
    const variants=new Map();
    for(const item of value.slice(0,25)){
      const schema=summarize(item,state,depth+1);
      const key=canonicalJson(schema);
      variants.set(key,schema);
    }
    return Object.freeze({
      type:"array",
      length:value.length,
      sampledCount:Math.min(value.length,25),
      itemSchemas:Object.freeze([...variants.values()])
    });
  }
  return Object.freeze({type});
}
function jsonStructure(bytes){
  let decoded;
  try{decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
  catch{return {contentKind:"binary",structure:null}}
  let parsed;
  try{parsed=JSON.parse(decoded)}
  catch{return {contentKind:"text",structure:null}}
  const state={nodes:0};
  return {contentKind:"json",structure:summarize(parsed,state)};
}
export function observePncpCustodyStructure({
  envelope,
  passphrase,
  expectedEnvelopeSha256,
  expectedReceiptSha256,
  expectedScopeSha256,
  captureRunId="35547609136",
  observerRevision=null
}={}){
  const envelopeHash=sha256(JSON.stringify(envelope));
  if(envelopeHash!==h64(expectedEnvelopeSha256,"ARCA_M5_PNCP_ENVELOPE_HASH_INVALID"))
    throw new Error("ARCA_M5_PNCP_ENVELOPE_HASH_MISMATCH");
  if(envelope.scopeHash!==h64(expectedScopeSha256,"ARCA_M5_PNCP_SCOPE_HASH_INVALID"))
    throw new Error("ARCA_M5_PNCP_SCOPE_HASH_MISMATCH");
  const receiptHash=h64(expectedReceiptSha256,"ARCA_M5_PNCP_RECEIPT_HASH_INVALID");
  const payload=openCustodyEnvelope({envelope,passphrase});
  const files=payload.files.map(file=>{
    const bytes=Buffer.from(file.data,"base64");
    const observed=jsonStructure(bytes);
    return Object.freeze({
      pathSha256:sha256(file.path),
      size:file.size,
      sha256:file.sha256,
      contentKind:observed.contentKind,
      ...(observed.structure?{structure:observed.structure}:{})
    });
  }).sort((a,b)=>a.pathSha256.localeCompare(b.pathSha256));
  const structureBody={
    fileCount:payload.fileCount,
    totalBytes:payload.totalBytes,
    files
  };
  const base={
    schema:M5_PNCP_CUSTODY_STRUCTURE_SCHEMA,
    version:1,
    source:"PNCP",
    captureRunId:String(captureRunId),
    captureRevision:envelope.revision,
    scopeSha256:envelope.scopeHash,
    custodyEnvelopeSha256:envelopeHash,
    custodyReceiptSha256:receiptHash,
    contentRootSha256:envelope.contentRootHash,
    observedStructureSha256:sha256(canonicalJson(structureBody)),
    structure:Object.freeze(structureBody),
    ...(observerRevision?{observerRevision:String(observerRevision).toLowerCase()}:{}),
    sourceCaptureNetworkUsed:true,
    observerNetworkUsed:false,
    valuesIncluded:false,
    rawBytesIncluded:false,
    normalizationPerformed:false,
    parserAdmitted:false,
    publicationAttempted:false,
    correlationAttempted:false,
    humanReviewRequired:true,
    adverseFinding:false
  };
  return Object.freeze({...base,observationSha256:sha256(canonicalJson(base))});
}
