import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {
  buildM5InvestigationManifest,
  verifyM5InvestigationManifest,
  evaluateM5PreCorrelationGate,
  M5_PRECORRELATION_GATE_SCHEMA
} from "./m5-investigation-manifest.mjs";
import {
  FINANCIAL_CORRELATION_REPORT_SCHEMA,
  runFinancialCorrelationOffline
} from "./financial-correlation-offline.mjs";
import {createDurableInvestigationQueue} from "../machine-bridge/investigation-queue.mjs";

export const M5_NORMALIZED_BUNDLE_SCHEMA="arca.m5-normalized-correlation-bundle.v1";
export const M5_CORRELATED_REVIEW_SCHEMA="arca.m5-correlated-review.v1";

const HASH=/^[a-f0-9]{64}$/;
const SOURCE_IDS=Object.freeze({
  PNCP:"br.pncp.public-api",
  PORTAL:"br.portal-transparencia.download-despesas"
});

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function exactKeys(input,keys,code){
  if(!plain(input))throw new Error(code);
  const actual=Object.keys(input).sort(), expected=[...keys].sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(code);
}
function hash(value,code){
  const out=String(value??"").trim().toLowerCase();
  if(!HASH.test(out))throw new Error(code);
  return out;
}
function text(value,code,max=256){
  const out=String(value??"").normalize("NFKC").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/.test(out))throw new Error(code);
  return out;
}
function clone(value){return JSON.parse(JSON.stringify(value))}
function deepFreeze(value){
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
  }
  return value;
}
function gateBody(gate){
  const out={...gate};
  delete out.gateSha256;
  return out;
}
function verifyReadyGate(gate,manifest){
  exactKeys(gate,[
    "schema","manifestSha256","status","readyForCorrelation","custodyVerified","evidence",
    "blockedSources","networkUsed","publicationAttempted","humanReviewRequired",
    "adverseFinding","gateSha256"
  ],"ARCA_M5_PHASE_B_GATE_SHAPE_INVALID");
  if(gate.schema!==M5_PRECORRELATION_GATE_SCHEMA||
     gate.manifestSha256!==manifest.manifestSha256||
     gate.status!=="READY_FOR_CORRELATION"||gate.readyForCorrelation!==true||
     gate.custodyVerified!==true||gate.networkUsed!==false||
     gate.publicationAttempted!==false||gate.humanReviewRequired!==true||
     gate.adverseFinding!==false||!Array.isArray(gate.blockedSources)||
     gate.blockedSources.length!==0||!Array.isArray(gate.evidence)||
     gate.evidence.length!==2||sha256(gateBody(gate))!==gate.gateSha256)
    throw new Error("ARCA_M5_PHASE_B_GATE_NOT_READY");
  const sources=gate.evidence.map(item=>item.source).sort();
  if(JSON.stringify(sources)!==JSON.stringify(["PNCP","PORTAL"]))
    throw new Error("ARCA_M5_PHASE_B_GATE_SOURCES_INVALID");
  return gate;
}
function custodyAnchor(source,envelopeSha256){
  return `custody:${source}:sha256:${envelopeSha256}`;
}
function sourceBinding(value,source,gateEvidence){
  exactKeys(value,[
    "source","custodyEnvelopeSha256","custodyReceiptSha256",
    "observedSchemaSha256","normalizationSha256","normalizationState"
  ],"ARCA_M5_PHASE_B_SOURCE_BINDING_INVALID");
  if(value.source!==source||value.normalizationState!=="NORMALIZED")
    throw new Error("ARCA_M5_PHASE_B_SOURCE_BINDING_INVALID");
  const normalized=Object.freeze({
    source,
    custodyEnvelopeSha256:hash(value.custodyEnvelopeSha256,"ARCA_M5_PHASE_B_CUSTODY_HASH_INVALID"),
    custodyReceiptSha256:hash(value.custodyReceiptSha256,"ARCA_M5_PHASE_B_CUSTODY_HASH_INVALID"),
    observedSchemaSha256:hash(value.observedSchemaSha256,"ARCA_M5_PHASE_B_SCHEMA_HASH_INVALID"),
    normalizationSha256:hash(value.normalizationSha256,"ARCA_M5_PHASE_B_NORMALIZATION_HASH_INVALID"),
    normalizationState:"NORMALIZED"
  });
  if(normalized.custodyEnvelopeSha256!==gateEvidence.envelopeSha256||
     normalized.custodyReceiptSha256!==gateEvidence.receiptSha256||
     gateEvidence.normalizationState!=="NORMALIZED")
    throw new Error("ARCA_M5_PHASE_B_CUSTODY_BINDING_MISMATCH");
  return normalized;
}
function hasAnchor(refs,anchor){
  return Array.isArray(refs)&&refs.includes(anchor);
}
function validateCorrelationFixture(fixture,manifest,bindings){
  if(!plain(fixture)||fixture.schema!=="arca.financial-correlation-fixture.v1")
    throw new Error("ARCA_M5_PHASE_B_CORRELATION_FIXTURE_INVALID");
  if(fixture.timeWindow!==`${manifest.timeWindow.start}/${manifest.timeWindow.end}`)
    throw new Error("ARCA_M5_PHASE_B_TIME_WINDOW_MISMATCH");
  const portalAnchor=custodyAnchor("PORTAL",bindings.PORTAL.custodyEnvelopeSha256);
  const pncpAnchor=custodyAnchor("PNCP",bindings.PNCP.custodyEnvelopeSha256);
  if(!Array.isArray(fixture.payments)||!Array.isArray(fixture.commitmentImpacts)||
     !Array.isArray(fixture.procurements)||!Array.isArray(fixture.strongBindings))
    throw new Error("ARCA_M5_PHASE_B_CORRELATION_FIXTURE_INVALID");
  for(const item of fixture.payments){
    if(item.sourceId!==SOURCE_IDS.PORTAL||!hasAnchor(item.provenanceRefs,portalAnchor))
      throw new Error("ARCA_M5_PHASE_B_PORTAL_PROVENANCE_UNBOUND");
  }
  for(const item of fixture.commitmentImpacts){
    if(item.sourceId!==SOURCE_IDS.PORTAL||!hasAnchor(item.provenanceRefs,portalAnchor))
      throw new Error("ARCA_M5_PHASE_B_PORTAL_PROVENANCE_UNBOUND");
  }
  for(const item of fixture.procurements){
    if(item.sourceId!==SOURCE_IDS.PNCP||!hasAnchor(item.provenanceRefs,pncpAnchor))
      throw new Error("ARCA_M5_PHASE_B_PNCP_PROVENANCE_UNBOUND");
  }
  for(const item of fixture.strongBindings){
    if(!hasAnchor(item.provenanceRefs,pncpAnchor)||!hasAnchor(item.provenanceRefs,portalAnchor))
      throw new Error("ARCA_M5_PHASE_B_BRIDGE_PROVENANCE_UNBOUND");
  }
  return Object.freeze({portalAnchor,pncpAnchor});
}

export function buildM5NormalizedCorrelationBundle({
  manifest,
  gate,
  sourceBindings,
  correlationFixture
}={}){
  const verifiedManifest=verifyM5InvestigationManifest(manifest);
  const verifiedGate=verifyReadyGate(gate,verifiedManifest);
  exactKeys(sourceBindings,["PNCP","PORTAL"],"ARCA_M5_PHASE_B_SOURCE_BINDINGS_INVALID");
  const gateBySource=Object.fromEntries(verifiedGate.evidence.map(item=>[item.source,item]));
  const bindings=Object.freeze({
    PNCP:sourceBinding(sourceBindings.PNCP,"PNCP",gateBySource.PNCP),
    PORTAL:sourceBinding(sourceBindings.PORTAL,"PORTAL",gateBySource.PORTAL)
  });
  const anchors=validateCorrelationFixture(correlationFixture,verifiedManifest,bindings);
  const base={
    schema:M5_NORMALIZED_BUNDLE_SCHEMA,
    manifestSha256:verifiedManifest.manifestSha256,
    gateSha256:verifiedGate.gateSha256,
    sourceBindings:bindings,
    correlationFixture:deepFreeze(clone(correlationFixture)),
    provenanceAnchors:Object.freeze({
      PNCP:anchors.pncpAnchor,
      PORTAL:anchors.portalAnchor
    }),
    networkUsed:false,
    publicationAttempted:false,
    adverseFinding:false
  };
  return Object.freeze({...base,bundleSha256:sha256(canonicalJson(base))});
}

export function verifyM5NormalizedCorrelationBundle({bundle,manifest,gate}={}){
  exactKeys(bundle,[
    "schema","manifestSha256","gateSha256","sourceBindings","correlationFixture",
    "provenanceAnchors","networkUsed","publicationAttempted","adverseFinding","bundleSha256"
  ],"ARCA_M5_PHASE_B_BUNDLE_SHAPE_INVALID");
  if(bundle.schema!==M5_NORMALIZED_BUNDLE_SCHEMA||bundle.networkUsed!==false||
     bundle.publicationAttempted!==false||bundle.adverseFinding!==false)
    throw new Error("ARCA_M5_PHASE_B_BUNDLE_INVALID");
  const rebuilt=buildM5NormalizedCorrelationBundle({
    manifest,gate,sourceBindings:bundle.sourceBindings,correlationFixture:bundle.correlationFixture
  });
  if(bundle.manifestSha256!==rebuilt.manifestSha256||
     bundle.gateSha256!==rebuilt.gateSha256||
     bundle.provenanceAnchors.PNCP!==rebuilt.provenanceAnchors.PNCP||
     bundle.provenanceAnchors.PORTAL!==rebuilt.provenanceAnchors.PORTAL||
     bundle.bundleSha256!==rebuilt.bundleSha256)
    throw new Error("ARCA_M5_PHASE_B_BUNDLE_INTEGRITY_INVALID");
  return rebuilt;
}

function provenanceAgent(context){
  return Object.freeze({
    agentId:"m5-provenance-analyst-v1",
    role:"PROVENANCE_ANALYST",
    inputDigest:context.inputDigest,
    assessment:"CUSTODY_AND_PROVENANCE_BOUND",
    evidenceRefs:Object.freeze([
      context.sourceBindings.PNCP.custodyEnvelopeSha256,
      context.sourceBindings.PORTAL.custodyEnvelopeSha256,
      context.correlationReportSha256
    ]),
    observations:Object.freeze([
      "PNCP normalized records remain bound to the PNCP custody envelope.",
      "Portal normalized records remain bound to the Portal custody envelope.",
      "Strong bridges carry provenance anchors from both source families."
    ]),
    adverseFinding:false,
    humanReviewRequired:true
  });
}
function comparabilityAgent(context){
  const states=context.relationStateCounts;
  return Object.freeze({
    agentId:"m5-comparability-analyst-v1",
    role:"COMPARABILITY_ANALYST",
    inputDigest:context.inputDigest,
    assessment:"DOCUMENT_RECONCILIATION_REQUIRES_HUMAN_REVIEW",
    evidenceRefs:Object.freeze([context.correlationReportSha256]),
    observations:Object.freeze([
      `states confirmed=${states.CONFIRMED} candidate=${states.CANDIDATE} conflicting=${states.CONFLICTING} notObserved=${states.NOT_OBSERVED}`,
      "Confirmed documentary linkage does not establish regularity, delivery, price adequacy, intent, or wrongdoing.",
      "NOT_OBSERVED remains a coverage state and CONFLICTING remains unresolved."
    ]),
    adverseFinding:false,
    humanReviewRequired:true
  });
}
export function createM5IndependentAgents(){
  return Object.freeze([provenanceAgent,comparabilityAgent]);
}
function runAgents(agents,context){
  if(!Array.isArray(agents)||agents.length!==2)throw new Error("ARCA_M5_PHASE_B_TWO_AGENTS_REQUIRED");
  const reports=agents.map(agent=>{
    if(typeof agent!=="function")throw new Error("ARCA_M5_PHASE_B_AGENT_INVALID");
    return agent(deepFreeze(clone(context)));
  });
  if(new Set(reports.map(item=>item.agentId)).size!==2||
     new Set(reports.map(item=>item.role)).size!==2||
     !reports.some(item=>item.role==="PROVENANCE_ANALYST")||
     !reports.some(item=>item.role==="COMPARABILITY_ANALYST"))
    throw new Error("ARCA_M5_PHASE_B_AGENTS_NOT_INDEPENDENT");
  if(reports.some(item=>item.inputDigest!==context.inputDigest||
     item.adverseFinding!==false||item.humanReviewRequired!==true))
    throw new Error("ARCA_M5_PHASE_B_AGENT_REPORT_UNSAFE");
  return Object.freeze(reports);
}
function adversarialVerify({correlation,bindings,bundle}){
  const challenges=[
    Object.freeze({
      kind:"CUSTODY_BINDING_COMPLETE",critical:true,resolved:true,
      provenanceRefs:Object.freeze([
        bindings.PNCP.custodyEnvelopeSha256,
        bindings.PORTAL.custodyEnvelopeSha256
      ])
    }),
    Object.freeze({
      kind:"OBSERVED_SCHEMA_NORMALIZATION_BOUND",critical:true,resolved:true,
      provenanceRefs:Object.freeze([
        bindings.PNCP.observedSchemaSha256,
        bindings.PORTAL.observedSchemaSha256,
        bindings.PNCP.normalizationSha256,
        bindings.PORTAL.normalizationSha256
      ])
    }),
    Object.freeze({
      kind:"CROSS_SOURCE_BRIDGE_PROVENANCE",critical:true,resolved:true,
      provenanceRefs:Object.freeze([
        bundle.provenanceAnchors.PNCP,
        bundle.provenanceAnchors.PORTAL
      ])
    })
  ];
  if(correlation.relationStateCounts.CONFLICTING>0)challenges.push(Object.freeze({
    kind:"CONFLICTING_RELATION_PRESERVED",critical:false,resolved:false,
    provenanceRefs:Object.freeze([correlation.reportSha256])
  }));
  if(correlation.relationStateCounts.NOT_OBSERVED>0)challenges.push(Object.freeze({
    kind:"NOT_OBSERVED_PRESERVED",critical:false,resolved:false,
    provenanceRefs:Object.freeze([correlation.reportSha256])
  }));
  if(correlation.allocation.some(item=>item.deltaCents!==0))challenges.push(Object.freeze({
    kind:"FINANCIAL_ALLOCATION_DELTA_REQUIRES_REVIEW",critical:false,resolved:false,
    provenanceRefs:Object.freeze([correlation.reportSha256])
  }));
  challenges.push(Object.freeze({
    kind:"PHASE_B_IS_OFFLINE_CONTRACT_PROOF",critical:false,resolved:false,
    provenanceRefs:Object.freeze([bundle.bundleSha256])
  }));
  const blocking=challenges.some(item=>item.critical&&!item.resolved);
  return Object.freeze({
    outcome:blocking?"HOLD_FOR_MORE_EVIDENCE":"ADVANCE_TO_HUMAN_REVIEW",
    challenges:Object.freeze(challenges),
    counterEvidencePreserved:true,
    notObservedIsNotDisappearance:true,
    outcomeIsNotGuiltFinding:true,
    humanReviewRequired:true
  });
}
function advanceQueue(queue,record,target){
  const states=["LEAD","TRIAGE","COLLECTION","ANALYSIS","ADVERSARIAL_VERIFICATION","HUMAN_REVIEW"];
  const start=states.indexOf(record.state),end=states.indexOf(target);
  if(start<0||end<0||start>end)throw new Error("ARCA_M5_PHASE_B_QUEUE_STATE_INVALID");
  let current=record;
  for(let i=start+1;i<=end;i++)current=queue.transition(current.investigationId,states[i]);
  return current;
}

export async function runM5PostCustodyCorrelation({
  manifest,
  gate,
  bundle,
  queueRoot,
  agents=createM5IndependentAgents(),
  triggerKind="SCHEDULED_REVIEW",
  triggerRef=null,
  participantRef=null,
  networkEnabled=false,
  publicationEnabled=false,
  clock=()=>new Date()
}={}){
  if(networkEnabled!==false)throw new Error("ARCA_M5_PHASE_B_NETWORK_FORBIDDEN");
  if(publicationEnabled!==false)throw new Error("ARCA_M5_PHASE_B_PUBLICATION_FORBIDDEN");
  if(!queueRoot)throw new Error("ARCA_M5_PHASE_B_QUEUE_ROOT_REQUIRED");
  const verifiedManifest=verifyM5InvestigationManifest(manifest);
  const verifiedGate=verifyReadyGate(gate,verifiedManifest);
  const verifiedBundle=verifyM5NormalizedCorrelationBundle({
    bundle,manifest:verifiedManifest,gate:verifiedGate
  });
  const correlation=runFinancialCorrelationOffline({
    fixture:verifiedBundle.correlationFixture,
    networkEnabled:false,
    publicationEnabled:false
  });
  if(correlation.schema!==FINANCIAL_CORRELATION_REPORT_SCHEMA)
    throw new Error("ARCA_M5_PHASE_B_CORRELATION_SCHEMA_INVALID");
  const relationCount=correlation.paymentCommitmentRelations.length+correlation.procurementFinancialRelations.length;
  if(relationCount>verifiedManifest.budgets.maxCorrelationRelations)
    throw new Error("ARCA_M5_PHASE_B_CORRELATION_BUDGET_EXCEEDED");
  const digestBody={
    manifestSha256:verifiedManifest.manifestSha256,
    gateSha256:verifiedGate.gateSha256,
    bundleSha256:verifiedBundle.bundleSha256,
    correlationReportSha256:correlation.reportSha256,
    sourceCustody:[
      verifiedBundle.sourceBindings.PNCP.custodyEnvelopeSha256,
      verifiedBundle.sourceBindings.PORTAL.custodyEnvelopeSha256
    ].sort()
  };
  const inputDigest=sha256(canonicalJson(digestBody));
  const context=deepFreeze({
    inputDigest,
    sourceBindings:clone(verifiedBundle.sourceBindings),
    correlationReportSha256:correlation.reportSha256,
    relationStateCounts:clone(correlation.relationStateCounts)
  });
  const reports=runAgents(agents,context);
  const verification=adversarialVerify({
    correlation,bindings:verifiedBundle.sourceBindings,bundle:verifiedBundle
  });
  const queue=createDurableInvestigationQueue({root:queueRoot,clock});
  const request=queue.request({
    scope:{
      jurisdiction:"BR/FEDERAL",
      subjectRef:verifiedManifest.subjectRef,
      topic:"m5-post-custody-document-reconciliation",
      timeWindow:`${verifiedManifest.timeWindow.start}/${verifiedManifest.timeWindow.end}`,
      sourceScopes:["PNCP","PORTAL"]
    },
    triggerKind,
    triggerRef:triggerRef??`m5-phase-b:${inputDigest}`,
    participantRef,
    priority:60
  });
  const target=verification.outcome==="ADVANCE_TO_HUMAN_REVIEW"?"HUMAN_REVIEW":"ADVERSARIAL_VERIFICATION";
  const record=advanceQueue(queue,request.record,target);
  const base={
    schema:M5_CORRELATED_REVIEW_SCHEMA,
    manifestSha256:verifiedManifest.manifestSha256,
    gateSha256:verifiedGate.gateSha256,
    bundleSha256:verifiedBundle.bundleSha256,
    inputDigest,
    sourceBindings:verifiedBundle.sourceBindings,
    correlation:Object.freeze({
      reportSha256:correlation.reportSha256,
      totalRelationCount:relationCount,
      procurementFinancialRelationCount:correlation.procurementFinancialRelations.length,
      paymentCommitmentRelationCount:correlation.paymentCommitmentRelations.length,
      relationStateCounts:correlation.relationStateCounts,
      oneToMany:correlation.oneToMany
    }),
    reports,
    verification,
    investigation:Object.freeze({
      investigationId:record.investigationId,
      state:record.state,
      deduplicated:!request.created
    }),
    network:Object.freeze({enabled:false,used:false}),
    publication:Object.freeze({enabled:false,attempted:false}),
    safety:Object.freeze({
      humanReviewRequired:true,
      adverseFinding:false,
      m5Accepted:false,
      phaseBOfflineContractProof:true,
      rawLiveBytesIncluded:false,
      protectedDataRequired:false
    })
  };
  return Object.freeze({...base,reportSha256:sha256(canonicalJson(base))});
}

export function buildM5PhaseBFixtureDocument({
  manifestInput,
  custodyInputs,
  sourceBindings,
  correlationFixture
}={}){
  const manifest=buildM5InvestigationManifest(manifestInput);
  const gate=evaluateM5PreCorrelationGate({manifest,inputs:custodyInputs});
  const bundle=buildM5NormalizedCorrelationBundle({manifest,gate,sourceBindings,correlationFixture});
  return Object.freeze({manifest,gate,bundle});
}
