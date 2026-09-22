import {createHash} from "node:crypto";

export const M4_CONTROLLED_SCOPE_SCHEMA="arca.m4-controlled-scope.v0.1";
export const M4_CONTROLLED_SCOPE_V02_SCHEMA="arca.m4-controlled-scope.v0.2";
const UFS=new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

function exactKeys(input,keys){
  if(!input||typeof input!=="object"||Array.isArray(input)||
     Object.keys(input).length!==keys.length||Object.keys(input).some(key=>!keys.includes(key)))
    throw new Error("ARCA_M4_SCOPE_UNEXPECTED_FIELD");
}
function budget(value,limit){
  if(!Number.isSafeInteger(value)||value<1||value>limit)
    throw new Error("ARCA_M4_SCOPE_INVALID_BUDGET");
  return value;
}
function revision(value){
  if(typeof value!=="string"||!/^[a-f0-9]{40}$/.test(value))
    throw new Error("ARCA_M4_SCOPE_INVALID_REVISION");
  return value;
}
function sha256(value){return createHash("sha256").update(value).digest("hex")}

export function buildM4ControlledScope(input){
  const source=input?.source;
  if(source!=="PNCP"&&source!=="PORTAL")throw new Error("ARCA_M4_SCOPE_INVALID_SOURCE");
  const keys=source==="PNCP"
    ?["source","confirmation","revision","uf","date","modalityId","maxBytes","timeoutMs"]
    :["source","confirmation","revision","documentCode","maxBytes","timeoutMs"];
  exactKeys(input,keys);
  if(input.confirmation!==(source==="PNCP"?"PNCP_PUBLIC_GET_ONLY":"PORTAL_DOCUMENT_GET_ONLY"))
    throw new Error("ARCA_M4_SCOPE_INVALID_CONFIRMATION");
  const codeRevision=revision(input.revision);
  let scope;
  if(source==="PNCP"){
    if(typeof input.uf!=="string"||!UFS.has(input.uf))throw new Error("ARCA_M4_SCOPE_INVALID_UF");
    const isoDate=typeof input.date==="string"&&/^\d{8}$/.test(input.date)
      ?`${input.date.slice(0,4)}-${input.date.slice(4,6)}-${input.date.slice(6,8)}`:null;
    const parsed=isoDate?new Date(`${isoDate}T00:00:00.000Z`):null;
    if(!parsed||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==isoDate)
      throw new Error("ARCA_M4_SCOPE_INVALID_DATE");
    if(!Number.isSafeInteger(input.modalityId)||input.modalityId<1||input.modalityId>10000)
      throw new Error("ARCA_M4_SCOPE_INVALID_MODALITY");
    scope={uf:input.uf,date:input.date,modalityId:input.modalityId,page:1};
  }else{
    if(typeof input.documentCode!=="string"||!/^[A-Z0-9._-]{1,80}$/.test(input.documentCode))
      throw new Error("ARCA_M4_SCOPE_INVALID_DOCUMENT_CODE");
    scope={documentCodeSha256:sha256(input.documentCode),phase:"PAYMENT",page:1};
  }
  const budgets={maxPages:1,maxRecords:source==="PNCP"?10:1,
    maxBytes:budget(input.maxBytes,source==="PNCP"?1024*1024:64*1024),
    timeoutMs:budget(input.timeoutMs,30000),retries:0};
  const body={schema:M4_CONTROLLED_SCOPE_SCHEMA,source,revision:codeRevision,scope,budgets,
    networkAuthorizedForThisManifest:false,publicationAttempted:false};
  return Object.freeze({...body,scope:Object.freeze(scope),budgets:Object.freeze(budgets),
    scopeSha256:sha256(JSON.stringify(body))});
}

export function buildM4ControlledScopeV02(input){
  const source=input?.source;
  if(source!=="PNCP"&&source!=="PORTAL")throw new Error("ARCA_M4_SCOPE_INVALID_SOURCE");
  const keys=source==="PNCP"
    ?["source","confirmation","revision","uf","date","modalityId","maxBytes","timeoutMs"]
    :["source","confirmation","revision","documentCode","maxBytes","timeoutMs"];
  exactKeys(input,keys);
  if(input.confirmation!==(source==="PNCP"?"PNCP_PUBLIC_GET_ONLY":"PORTAL_DOCUMENT_GET_ONLY"))
    throw new Error("ARCA_M4_SCOPE_INVALID_CONFIRMATION");
  const codeRevision=revision(input.revision);
  let scope;
  let budgets;
  if(source==="PNCP"){
    if(typeof input.uf!=="string"||!UFS.has(input.uf))throw new Error("ARCA_M4_SCOPE_INVALID_UF");
    const isoDate=typeof input.date==="string"&&/^\d{8}$/.test(input.date)
      ?`${input.date.slice(0,4)}-${input.date.slice(4,6)}-${input.date.slice(6,8)}`:null;
    const parsed=isoDate?new Date(`${isoDate}T00:00:00.000Z`):null;
    if(!parsed||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==isoDate)
      throw new Error("ARCA_M4_SCOPE_INVALID_DATE");
    if(!Number.isSafeInteger(input.modalityId)||input.modalityId<1||input.modalityId>10000)
      throw new Error("ARCA_M4_SCOPE_INVALID_MODALITY");
    scope={uf:input.uf,date:input.date,modalityId:input.modalityId,page:1};
    budgets={maxPages:1,maxRecords:10,maxBytes:budget(input.maxBytes,1024*1024),
      timeoutMs:budget(input.timeoutMs,30000),retries:0};
  }else{
    if(typeof input.documentCode!=="string"||input.documentCode.length<1||input.documentCode.length>80||
       input.documentCode.trim()!==input.documentCode||/[\s\u0000-\u001f\u007f]/u.test(input.documentCode))
      throw new Error("ARCA_M4_SCOPE_INVALID_DOCUMENT_CODE");
    if(input.maxBytes!==65536||input.timeoutMs!==30000)
      throw new Error("ARCA_M4_SCOPE_INVALID_BUDGET");
    scope={endpointId:"PORTAL_EXPENSE_RELATED_DOCUMENTS",phaseCode:3,
      documentCodeSha256:sha256(input.documentCode)};
    budgets={maxRequests:1,maxRecords:25,maxBytes:65536,timeoutMs:30000,retries:0};
  }
  const body={schema:M4_CONTROLLED_SCOPE_V02_SCHEMA,source,revision:codeRevision,scope,budgets,
    networkAuthorizedForThisManifest:false,publicationAttempted:false};
  return Object.freeze({...body,scope:Object.freeze(scope),budgets:Object.freeze(budgets),
    scopeSha256:sha256(JSON.stringify(body))});
}
