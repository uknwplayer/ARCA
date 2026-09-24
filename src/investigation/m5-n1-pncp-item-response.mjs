import {canonicalJson,sha256} from "./public-source-contract.mjs";

function parseJson(bytes){
  let text;try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}catch{throw new Error("ARCA_M5_N1_UTF8_INVALID")}
  try{return JSON.parse(text)}catch{throw new Error("ARCA_M5_N1_JSON_INVALID")}
}
function item(x){
  if(!x||typeof x!=="object"||Array.isArray(x)||
     !Number.isSafeInteger(x.numeroItem)||x.numeroItem<1||
     typeof x.temResultado!=="boolean")
    throw new Error("ARCA_M5_N1_ITEM_SHAPE_INVALID");
  return Object.freeze({numeroItem:x.numeroItem,temResultado:x.temResultado});
}

export function observeM5N1ItemsResponse({bytes,httpStatus,targetSha256,pageSize=10}={}){
  if(httpStatus!==200)return Object.freeze({
    targetSha256,httpStatus,parsed:false,itemCount:null,itemsWithResultCount:null,
    pagePossiblyTruncated:false,resultItemSetSha256:null,nextStageReady:false,
    rawValuesIncluded:false
  });
  const parsed=parseJson(bytes);
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||!Array.isArray(parsed.itens))
    throw new Error("ARCA_M5_N1_RESPONSE_SHAPE_INVALID");
  if(parsed.itens.length>pageSize)throw new Error("ARCA_M5_N1_ITEM_BUDGET_EXCEEDED");
  const items=parsed.itens.map(item);
  if(new Set(items.map(x=>x.numeroItem)).size!==items.length)
    throw new Error("ARCA_M5_N1_DUPLICATE_ITEM");
  const resultItems=items.filter(x=>x.temResultado).map(x=>x.numeroItem).sort((a,b)=>a-b);
  const pagePossiblyTruncated=items.length===pageSize;
  return Object.freeze({
    targetSha256,
    httpStatus,
    parsed:true,
    itemCount:items.length,
    itemsWithResultCount:resultItems.length,
    pagePossiblyTruncated,
    resultItemSetSha256:sha256(canonicalJson(resultItems)),
    nextStageReady:!pagePossiblyTruncated&&resultItems.length>0,
    rawValuesIncluded:false
  });
}
