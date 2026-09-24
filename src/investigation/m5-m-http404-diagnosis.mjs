import {createHash} from "node:crypto";

export const M5_M_HTTP404_DIAGNOSIS_SCHEMA="arca.m5-m-http404-diagnosis.v1";
const sha256=v=>createHash("sha256").update(v).digest("hex");

function utf8(bytes){
  try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
  catch{throw new Error("ARCA_M5_M_404_UTF8_INVALID")}
}
function fold(value){
  return String(value??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
}
function flags(value){
  const t=fold(value);
  return Object.freeze({
    mentionsNotFound:/NOT FOUND|NAO ENCONTR|NENHUM.{0,24}ENCONTR|NAO FOI ENCONTR|INEXIST|NAO EXIST/.test(t),
    mentionsContract:/CONTRAT|EMPENH/.test(t),
    mentionsRoute:/NO STATIC RESOURCE|STATIC RESOURCE|ROUTE|ENDPOINT|MAPPING|HANDLER|RESOURCE/.test(t),
    mentionsParameter:/PARAMETR|PARAMETER|ARGUMENT/.test(t),
    mentionsUnauthorized:/UNAUTHORIZED|NAO AUTORIZ/.test(t),
    mentionsForbidden:/FORBIDDEN|PROIBID/.test(t)
  });
}
function classify(all,status){
  const f=flags(all);
  if(f.mentionsUnauthorized||f.mentionsForbidden)return "ACCESS_ERROR";
  if(status===404&&f.mentionsContract&&f.mentionsNotFound&&!f.mentionsRoute)
    return "NO_LINKED_CONTRACT_OR_COMMITMENT_OBSERVED";
  if(status===404&&f.mentionsRoute&&f.mentionsNotFound)
    return "ROUTE_OR_RESOURCE_NOT_FOUND";
  if(f.mentionsParameter)return "REQUEST_PARAMETER_REJECTED";
  if(status===404)return "GENERIC_HTTP_404_NO_SAFE_DETAIL";
  return "UNCLASSIFIED";
}
function safeKeys(obj){
  return Object.keys(obj).sort().filter(k=>/^[A-Za-z0-9_.-]{1,80}$/.test(k)).slice(0,40);
}

export function diagnoseM5MHttp404Body({bytes,expectedResponseSha256,targetSha256}={}){
  const raw=Buffer.from(bytes??[]);
  if(raw.length===0)throw new Error("ARCA_M5_M_404_BYTES_INVALID");
  const digest=sha256(raw);
  if(digest!==expectedResponseSha256)throw new Error("ARCA_M5_M_404_RESPONSE_HASH_MISMATCH");
  const text=utf8(raw);
  let parsed=null;try{parsed=JSON.parse(text)}catch{}
  const jsonKind=Array.isArray(parsed)?"ARRAY":(parsed&&typeof parsed==="object"?"OBJECT":"NOT_JSON");
  const topLevelKeys=jsonKind==="OBJECT"?safeKeys(parsed):[];
  let numericStatus=null;
  const strings=[];
  if(jsonKind==="OBJECT"){
    for(const key of topLevelKeys){
      const v=parsed[key];
      if(typeof v==="string")strings.push({key,value:v});
      if(key==="status"&&Number.isSafeInteger(v))numericStatus=v;
    }
  }
  const all=strings.map(x=>x.value).join("\n");
  const aggregateFlags=flags(all);
  const stringFields=strings.map(({key,value})=>Object.freeze({
    key,
    length:value.length,
    sha256:sha256(value),
    ...flags(value),
    ...(key==="error"&&["Not Found","Bad Request","Forbidden","Unauthorized"].includes(value)
      ?{allowlistedValue:value}:{}),
    ...(key==="path"?{
      pathPresent:true,
      internalPncpApiPrefix:fold(value).startsWith("/PNCP-API/"),
      pathTemplateSha256:sha256(value.replace(/\d+/g,"{N}"))
    }:{})
  }));
  return Object.freeze({
    targetSha256,
    responseByteCount:raw.length,
    responseBytesSha256:digest,
    jsonKind,
    topLevelKeys:Object.freeze(topLevelKeys),
    numericStatus,
    aggregateFlags,
    stringFields:Object.freeze(stringFields),
    diagnosis:classify(all,numericStatus),
    rawBodyIncluded:false
  });
}

export function summarizeM5MHttp404Diagnosis({items}={}){
  if(!Array.isArray(items)||items.length!==2)throw new Error("ARCA_M5_M_404_ITEM_COUNT_INVALID");
  const base={
    schema:M5_M_HTTP404_DIAGNOSIS_SCHEMA,
    version:1,
    source:"PNCP",
    liveRunId:"36039677768",
    candidateSha256:"3905c087fb9fe6c8d2f4a984d5f79b9a22dba8d6bb81ca7d33b32147032ba606",
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
