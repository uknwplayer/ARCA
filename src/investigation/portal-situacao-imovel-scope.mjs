import {sha256} from "./public-source-contract.mjs";

export const PORTAL_SITUACAO_IMOVEL_TARGET_ID="PORTAL_SITUACAO_IMOVEL";
export const PORTAL_SITUACAO_IMOVEL_PATH="/api-de-dados/situacao-imovel";
export const PORTAL_SITUACAO_IMOVEL_CONTRACT_ID="PORTAL_AUTH_SITUACAO_IMOVEL";

export function buildPortalSituacaoImovelScope({revision,maxBytes=32768,timeoutMs=30000}={}){
  const rev=String(revision??"").trim().toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(rev))throw new Error("ARCA_PORTAL_SI_REVISION_INVALID");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>32768)
    throw new Error("ARCA_PORTAL_SI_MAX_BYTES_INVALID");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)
    throw new Error("ARCA_PORTAL_SI_TIMEOUT_INVALID");
  const scope={
    schema:"arca.portal-situacao-imovel-scope.v1",
    targetId:PORTAL_SITUACAO_IMOVEL_TARGET_ID,
    contractId:PORTAL_SITUACAO_IMOVEL_CONTRACT_ID,
    method:"GET",
    path:PORTAL_SITUACAO_IMOVEL_PATH,
    query:{},
    revision:rev,
    budgets:{maxRequests:1,maxBytes,timeoutMs,retries:0},
    publicationAuthorized:false,
    automaticRetryAuthorized:false
  };
  return Object.freeze({
    scope:Object.freeze(scope),
    scopeSha256:sha256(scope),
    targetBindingSha256:sha256({
      targetId:scope.targetId,
      contractId:scope.contractId,
      method:scope.method,
      path:scope.path,
      query:scope.query
    })
  });
}
