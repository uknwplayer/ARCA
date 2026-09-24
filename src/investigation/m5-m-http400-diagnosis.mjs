import {createHash} from "node:crypto";

export const M5_M_HTTP400_DIAGNOSIS_SCHEMA="arca.m5-m-http400-diagnosis.v1";

const sha256=v=>createHash("sha256").update(v).digest("hex");
const EXPECTED_PATH=/^\/api\/pncp\/v1\/orgaos\/\d{14}\/contratos\/contratacao\/\d{4}\/\d{1,9}$/;

function utf8(bytes){
  try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
  catch{throw new Error("ARCA_M5_M_DIAG_UTF8_INVALID")}
}
function fold(value){
  return String(value??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
}
function keywordFlags(text){
  const t=fold(text);
  return Object.freeze({
    mentionsCnpj:/\bCNPJ\b/.test(t),
    mentionsAno:/\bANO\b/.test(t),
    mentionsSequencial:/SEQUENC/.test(t),
    mentionsContrat:/CONTRAT/.test(t),
    mentionsParametro:/PARAMETR|PARAMETER/.test(t),
    mentionsInvalido:/INVALID|INVALIDO|INVALIDA/.test(t),
    mentionsObrigatorio:/REQUIRED|OBRIGATOR/.test(t),
    mentionsNaoEncontrado:/NOT FOUND|NAO ENCONTR/.test(t),
    mentionsConversao:/CONVERT|CONVERS/.test(t),
    mentionsValidation:/VALIDATION|VALIDAC/.test(t),
    mentionsArgument:/ARGUMENT|ARGUMENTO/.test(t),
    mentionsRequest:/REQUEST|REQUISIC/.test(t),
    mentionsUnauthorized:/UNAUTHORIZED|NAO AUTORIZ/.test(t),
    mentionsForbidden:/FORBIDDEN|PROIBID/.test(t)
  });
}
function safeTopKeys(obj){
  return Object.keys(obj).sort().filter(k=>/^[A-Za-z0-9_.-]{1,80}$/.test(k)).slice(0,40);
}
function stringMeta(key,value){
  const flags=keywordFlags(value);
  const out={
    key,
    length:value.length,
    sha256:sha256(value),
    ...flags
  };
  if(["error","title"].includes(key)&&[
    "Bad Request","Not Found","Unauthorized","Forbidden","Internal Server Error"
  ].includes(value))out.allowlistedValue=value;
  if(key==="path"){
    out.pathPresent=true;
    out.expectedPathShape=EXPECTED_PATH.test(value);
    out.pathTemplateSha256=sha256(value.replace(/\d+/g,"{N}"));
  }
  return Object.freeze(out);
}
function classify(strings,rootFlags){
  const all=[...strings.map(x=>x.value)].join("\n");
  const f=keywordFlags(all);
  if(f.mentionsUnauthorized||f.mentionsForbidden)return "ACCESS_ERROR";
  if(f.mentionsNaoEncontrado)return "NOT_FOUND_OR_ABSENT_REFERENCE";
  if(f.mentionsConversao)return "PATH_PARAMETER_CONVERSION_ERROR";
  if((f.mentionsParametro||f.mentionsArgument||f.mentionsValidation)&&
     (f.mentionsCnpj||f.mentionsAno||f.mentionsSequencial))
    return "PATH_PARAMETER_VALIDATION_ERROR";
  if(f.mentionsInvalido&&(f.mentionsCnpj||f.mentionsAno||f.mentionsSequencial))
    return "PATH_PARAMETER_INVALID";
  if(rootFlags.status===400)return "GENERIC_HTTP_400_NO_SAFE_DETAIL";
  return "UNCLASSIFIED";
}

export function diagnoseM5MHttp400Body({bytes,expectedResponseSha256,targetSha256}={}){
  if(!Buffer.isBuffer(bytes)&&!(bytes instanceof Uint8Array))
    throw new Error("ARCA_M5_M_DIAG_BYTES_INVALID");
  const raw=Buffer.from(bytes);
  const digest=sha256(raw);
  if(digest!==expectedResponseSha256)throw new Error("ARCA_M5_M_DIAG_RESPONSE_HASH_MISMATCH");
  const text=utf8(raw);
  let parsed=null;
  try{parsed=JSON.parse(text)}catch{}
  const jsonKind=Array.isArray(parsed)?"ARRAY":(parsed&&typeof parsed==="object"?"OBJECT":"NOT_JSON");
  const topLevelKeys=jsonKind==="OBJECT"?safeTopKeys(parsed):[];
  const strings=[];
  let numericStatus=null;
  if(jsonKind==="OBJECT"){
    for(const key of topLevelKeys){
      const v=parsed[key];
      if(typeof v==="string")strings.push({key,value:v});
      if(key==="status"&&Number.isSafeInteger(v))numericStatus=v;
    }
  }
  const stringFields=strings.map(x=>stringMeta(x.key,x.value));
  const aggregateFlags=keywordFlags(strings.map(x=>x.value).join("\n"));
  const diagnosis=classify(strings,{status:numericStatus});
  return Object.freeze({
    targetSha256,
    responseByteCount:raw.length,
    responseBytesSha256:digest,
    jsonKind,
    topLevelKeys:Object.freeze(topLevelKeys),
    numericStatus,
    stringFields:Object.freeze(stringFields),
    aggregateFlags,
    diagnosis,
    rawBodyIncluded:false
  });
}

export function summarizeM5MHttp400Diagnosis({items}={}){
  if(!Array.isArray(items)||items.length!==2)
    throw new Error("ARCA_M5_M_DIAG_ITEM_COUNT_INVALID");
  const base={
    schema:M5_M_HTTP400_DIAGNOSIS_SCHEMA,
    version:1,
    source:"PNCP",
    liveRunId:"36036733351",
    candidateSha256:"aa995fd2886bc5707ff63dc6e672b3a1a5a1d6770b179122927775aa752c99ec",
    sourceRequestCount:0,
    sourceNetworkUsed:false,
    publicationAttempted:false,
    correlationAttempted:false,
    itemCount:2,
    items:Object.freeze(items),
    sameDiagnosis:items[0].diagnosis===items[1].diagnosis,
    sameJsonShape:JSON.stringify(items[0].topLevelKeys)===JSON.stringify(items[1].topLevelKeys),
    rawBodiesIncluded:false,
    humanReviewRequired:true,
    adverseFinding:false
  };
  return Object.freeze({...base,diagnosisSha256:sha256(JSON.stringify(base))});
}
