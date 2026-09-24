import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {
  buildM5PortalLiveNormalizedBinding,
  buildM5PhaseBPortalInputs
} from "./m5-portal-live-normalized-binding.mjs";
import {
  buildM5PncpLiveNormalizedBinding,
  buildM5PhaseBPncpInputs
} from "./m5-pncp-live-normalized-binding.mjs";

export const M5_CORRELATION_READINESS_SCHEMA=
  "arca.m5-correlation-readiness.v1";

function bridge(id,classification,usable,reason){
  return Object.freeze({id,classification,usable,reason});
}

export function evaluateM5CorrelationReadiness({portalBinding,pncpBinding}={}){
  const portal=buildM5PhaseBPortalInputs(portalBinding);
  const pncp=buildM5PhaseBPncpInputs(pncpBinding);

  const bridges=Object.freeze([
    bridge(
      "SUPPLIER_IDENTIFIER",
      "UNAVAILABLE_BY_PNCP_COVERAGE",
      false,
      "PNCP supplierObserved=false; fornecedor nao pode ser inferido."
    ),
    bridge(
      "AGENCY_SHARED_IDENTIFIER",
      "NO_SHARED_STRONG_IDENTIFIER",
      false,
      "PNCP possui identificador estruturado de orgao; Portal atual preserva orgaos/unidade como texto, sem identificador forte compartilhado no binding."
    ),
    bridge(
      "DIRECT_CROSS_SOURCE_REFERENCE",
      "NOT_OBSERVED",
      false,
      "Nenhum identificador cross-source direto foi observado nos contratos normalizados atuais."
    ),
    bridge(
      "DOCUMENT_REFERENCE",
      "CANDIDATE_PRIVATE_COMPARISON",
      false,
      "PNCP e Portal possuem referencias documentais, mas com semanticas distintas; igualdade nao pode ser presumida."
    ),
    bridge(
      "AGENCY_TEXT",
      "CANDIDATE_PRIVATE_COMPARISON",
      false,
      "Nomes textuais podem ser comparados privadamente, mas nao constituem identificador forte."
    ),
    bridge(
      "DATE",
      "WEAK_CONTEXT_ONLY",
      false,
      "Datas podem apoiar comparabilidade temporal, nunca identidade documental por si so."
    ),
    bridge(
      "AMOUNT",
      "WEAK_CONTEXT_ONLY",
      false,
      "Valores monetarios podem apoiar triagem, mas nao provam vinculo por si so."
    )
  ]);

  const unavailableStrong=bridges.filter(x=>
    ["UNAVAILABLE_BY_PNCP_COVERAGE","NO_SHARED_STRONG_IDENTIFIER","NOT_OBSERVED"].includes(x.classification)
  ).map(x=>x.id);

  const candidateDimensions=bridges.filter(x=>
    x.classification==="CANDIDATE_PRIVATE_COMPARISON"
  ).map(x=>x.id);

  const weakDimensions=bridges.filter(x=>
    x.classification==="WEAK_CONTEXT_ONLY"
  ).map(x=>x.id);

  const base={
    schema:M5_CORRELATION_READINESS_SCHEMA,
    version:1,
    status:"LIMITED_CANDIDATE_SCREENING_ONLY",
    portalBindingSha256:portal.derivedNormalization.bindingSha256,
    pncpBindingSha256:pncp.derivedNormalization.bindingSha256,
    sourceState:Object.freeze({
      PORTAL:"NORMALIZED_PRIVATE",
      PNCP:"NORMALIZED_PRIVATE"
    }),
    bridges,
    unavailableStrongBridges:Object.freeze(unavailableStrong),
    candidateDimensions:Object.freeze(candidateDimensions),
    weakDimensions:Object.freeze(weakDimensions),
    readyForStrongCorrelation:false,
    readyForPrivateCandidateScreening:true,
    candidateScreeningRequiresPrivateValues:true,
    supplierBridgeAvailable:false,
    supplierInferenceAllowed:false,
    networkUsed:false,
    publicationAttempted:false,
    correlationAttempted:false,
    correlationAuthorized:false,
    adverseFinding:false,
    humanReviewRequired:true,
    nextStep:"PRIVATE_CANDIDATE_SCREENING_GATE"
  };
  return Object.freeze({...base,readinessSha256:sha256(canonicalJson(base))});
}

export function buildM5CorrelationReadinessFromInputs({
  portalInput,
  pncpInput
}={}){
  const portalDoc={...portalInput}; delete portalDoc.schema;
  const pncpDoc={...pncpInput}; delete pncpDoc.schema;
  return evaluateM5CorrelationReadiness({
    portalBinding:buildM5PortalLiveNormalizedBinding(portalDoc),
    pncpBinding:buildM5PncpLiveNormalizedBinding(pncpDoc)
  });
}
