import {resolve} from "node:path";
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  collectPncpSnapshot,
  createPncpHttpTransport,
  capturePncpSnapshotResponses
} from "./index.ts";

function requiredText(value,field,max=160){
  if(typeof value!=="string"||!value.trim())throw new TypeError(`${field} obrigatorio`);
  if(value.length>max)throw new RangeError(`${field} excede ${max} caracteres`);
  return value.trim();
}

function summarizeCapture(capture){
  return {
    acquisitionId:capture?.manifest?.acquisitionId??null,
    investigationId:capture?.manifest?.investigationId??null,
    sourceId:capture?.manifest?.original?.sourceId??null,
    locator:capture?.manifest?.original?.locator??null,
    originalSha256:capture?.manifest?.original?.originalSha256??null,
    byteLength:capture?.manifest?.original?.byteLength??null,
    custodyManifest:capture?.proposal?.operation?.data?.custodyManifest??null,
    humanReviewRequired:capture?.proposal?.humanReviewRequired===true
  };
}

export async function acquirePncpPublicWithCustody(input,options={}){
  if(input?.authorizePublicNetwork!==true)throw new Error("autorizacao explicita de rede publica PNCP obrigatoria");
  const investigationId=requiredText(input?.investigationId,"investigationId",72);
  const sourceId=requiredText(input?.sourceId,"sourceId",72);
  const workerId=requiredText(options?.workerId,"workerId",160);
  const custodyHome=resolve(requiredText(options?.custodyHome,"custodyHome",4096));
  const stagingRoot=resolve(requiredText(options?.stagingRoot,"stagingRoot",4096));
  const maxBytes=options.maxBytes??DEFAULT_MAX_RESPONSE_BYTES;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0||maxBytes>DEFAULT_MAX_RESPONSE_BYTES)throw new RangeError(`maxBytes deve estar entre 1 e ${DEFAULT_MAX_RESPONSE_BYTES}`);

  const transport=createPncpHttpTransport({
    allowNetwork:true,
    fetchImpl:options.fetchImpl,
    maxBytes,
    timeoutMs:options.timeoutMs,
    maxRetries:options.maxRetries
  });
  const snapshot=await collectPncpSnapshot(input.target,{
    transport,
    includeBudgetSources:input.includeBudgetSources!==false
  });
  const captured=await capturePncpSnapshotResponses(snapshot,{
    investigationId,
    sourceId,
    actor:{id:workerId,role:"authorized-pncp-public-worker"},
    stagingRoot,
    custodyHome,
    maxBytes
  });
  if(!captured.analysisMayProceed)throw new Error("captura de custodia incompleta; resultado PNCP nao liberado");

  return {
    format:"arca-pncp-public-acquisition-v1",
    connectorVersion:"0.4.0-v3-c1b",
    target:snapshot.target,
    retrievedAt:snapshot.retrievedAt,
    networkUsed:true,
    publicAccessOnly:true,
    analysisMayProceed:true,
    resources:snapshot.responses.map(({descriptor,response})=>({
      kind:descriptor.kind,
      required:descriptor.required,
      url:response.url,
      status:response.status,
      ok:response.ok,
      contentType:response.contentType,
      accessedAt:response.accessedAt,
      sha256:response.sha256,
      byteLength:response.bytes?.byteLength??0,
      attemptCount:response.attemptCount
    })),
    captures:captured.captures.map(summarizeCapture),
    capturedCount:captured.capturedCount,
    humanReviewRequired:true,
    rawBytesReturned:false,
    limitations:[
      "A aquisicao consulta apenas endpoints publicos GET allowlisted do PNCP.",
      "Os bytes brutos permanecem na cadeia de custodia configurada no worker e nao sao retornados pelo job.",
      "Qualquer analise ou promocao probatoria exige revisao humana posterior."
    ]
  };
}
