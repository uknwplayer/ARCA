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
  const runtimeShape=Array.isArray(parsed)
    ?"BARE_ARRAY"
    :(parsed&&typeof parsed==="object"&&!Array.isArray(parsed)&&Array.isArray(parsed.itens)
      ?"OBJECT_ITENS"
      :null);
  if(runtimeShape===null)throw new Error("ARCA_M5_N1_RESPONSE_SHAPE_INVALID");
  const rawItems=runtimeShape==="BARE_ARRAY"?parsed:parsed.itens;
  if(rawItems.length>pageSize)throw new Error("ARCA_M5_N1_ITEM_BUDGET_EXCEEDED");
  const items=rawItems.map(item);
  if(new Set(items.map(x=>x.numeroItem)).size!==items.length)
    throw new Error("ARCA_M5_N1_DUPLICATE_ITEM");
  const resultItems=items.filter(x=>x.temResultado).map(x=>x.numeroItem).sort((a,b)=>a-b);
  const pagePossiblyTruncated=items.length===pageSize;
  return Object.freeze({
    targetSha256,
    httpStatus,
    parsed:true,
    responseShape:runtimeShape,
    itemCount:items.length,
    itemsWithResultCount:resultItems.length,
    pagePossiblyTruncated,
    resultItemSetSha256:sha256(canonicalJson(resultItems)),
    nextStageReady:!pagePossiblyTruncated&&resultItems.length>0,
    rawValuesIncluded:false
  });
}


export function diagnoseM5N1ResponseShape({bytes,httpStatus,targetSha256}={}){
  const raw=Buffer.from(bytes??[]);
  let jsonKind="NOT_JSON";
  let topLevelKeys=[];
  let arrayLength=null;
  let hasItensArray=false;
  let itensLength=null;
  let utf8Valid=true;
  let parsed=null;
  try{
    const text=new TextDecoder("utf-8",{fatal:true}).decode(raw);
    try{parsed=JSON.parse(text)}catch{}
  }catch{
    utf8Valid=false;
  }
  if(utf8Valid&&parsed!==null){
    if(Array.isArray(parsed)){
      jsonKind="ARRAY";
      arrayLength=parsed.length;
    }else if(typeof parsed==="object"){
      jsonKind="OBJECT";
      topLevelKeys=Object.keys(parsed).sort().filter(k=>/^[A-Za-z0-9_.-]{1,80}$/.test(k)).slice(0,50);
      hasItensArray=Array.isArray(parsed.itens);
      if(hasItensArray)itensLength=parsed.itens.length;
    }else{
      jsonKind="SCALAR";
    }
  }else if(!utf8Valid){
    jsonKind="INVALID_UTF8";
  }
  const shapeDescriptor={
    httpStatus,
    jsonKind,
    topLevelKeys,
    arrayLength,
    hasItensArray,
    itensLength
  };
  return Object.freeze({
    targetSha256,
    httpStatus,
    utf8Valid,
    jsonKind,
    topLevelKeys:Object.freeze(topLevelKeys),
    arrayLength,
    hasItensArray,
    itensLength,
    shapeSha256:sha256(canonicalJson(shapeDescriptor)),
    rawValuesIncluded:false
  });
}
