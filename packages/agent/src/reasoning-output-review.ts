import {createHash} from "node:crypto";
import {HumanReviewQueue} from "./reviews.ts";
import {ReviewGatedContinuation} from "./review-continuation.ts";
import {classifyPrivacyRecord,verifyPrivacyClassification} from "./privacy-classification.ts";
import {ARCA_REASONING_RESULT_FORMAT} from "./reasoning-capability.ts";
import {ARCA_VERIFIED_DURABLE_OPAQUE_REASONING_RESULT_FORMAT} from "./reasoning-durable-opaque-adapter.ts";

export const ARCA_REASONING_OUTPUT_REVIEW_FORMAT="arca-reasoning-output-review-v1";
export const DEFAULT_REASONING_REVIEW_OUTPUT_LIMIT=128*1024;

const SAFE_ID=/^[A-Za-z0-9._:-]{1,200}$/;
const HASH=/^[a-f0-9]{64}$/;
const PRIVACY_CLASSES=new Set(["public","personal","sensitive","high-risk","restricted","redact-before-publication"]);

type JsonObject=Record<string,any>;

export type ReasoningOutputReviewOptions={
  defaultPrivacyClass?:"public"|"personal"|"sensitive"|"high-risk"|"restricted"|"redact-before-publication";
  maxPersistedOutputBytes?:number;
};

export type ReasoningAuthorizationContext={
  kind:"registered-workflow";
  proposalId:string;
  proposalHash:string;
  planHash:string;
  workflowDefinitionHash:string;
  bindingHash:string;
};
export type ReasoningOutputClassificationOptions={
  privacyClass?:"public"|"personal"|"sensitive"|"high-risk"|"restricted"|"redact-before-publication";
  subjectType?:"none"|"natural-person"|"legal-entity"|"mixed";
  indicators?:JsonObject;
  sourceRefs?:string[];
  legalReviewState?:"not-assessed"|"not-required"|"required"|"completed";
  authorizationContext?:ReasoningAuthorizationContext;
};

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeId(value:unknown,label:string){const text=String(value??"").trim();if(!SAFE_ID.test(text))throw new TypeError(`${label} invalido`);return text}
function jsonOutput(value:any){let serialized:string;try{serialized=JSON.stringify(value)}catch{throw new TypeError("reasoning output deve ser JSON serializavel")}if(serialized===undefined)throw new TypeError("reasoning output ausente");return {value:JSON.parse(serialized),serialized,bytes:Buffer.byteLength(serialized)}}
function normalizeReasoning(result:any){
  if(!plain(result))throw new TypeError("reasoning result invalido");
  if(result.format===ARCA_VERIFIED_DURABLE_OPAQUE_REASONING_RESULT_FORMAT){
    if(!plain(result.reasoning)||result.reasoning.format!==ARCA_REASONING_RESULT_FORMAT)throw new Error("verified durable reasoning wrapper sem reasoning result valido");
    return {wrapper:result,reasoning:result.reasoning,executionEvidenceHash:result.executionEvidenceHash??null,resultHash:result.resultHash??null};
  }
  if(result.format===ARCA_REASONING_RESULT_FORMAT)return {wrapper:null,reasoning:result,executionEvidenceHash:null,resultHash:null};
  throw new Error("formato de reasoning result nao suportado para review");
}
function priorityFor(privacyClass:string,indicators:any){
  if(indicators?.secretOrCredential===true)return "critical";
  if(["restricted","high-risk","sensitive"].includes(privacyClass))return "high";
  if(privacyClass==="personal"||privacyClass==="redact-before-publication")return "normal";
  return "low";
}
function normalizedIndicators(value:any={}){
  if(!plain(value))throw new TypeError("reasoning output indicators deve ser objeto");
  const allowed=[
    "directIdentifier","financialIdentifier","precisePrivateLocation","healthOrBiometric",
    "politicalReligiousUnionSexualSensitive","childOrAdolescent","privateCommunication",
    "secretOrCredential","accusationOrAdverseInference","sourcePubliclyAccessible","sourceOfficial",
    "publicInterestNecessary","canMinimize","disputedOrOutdated"
  ];
  const out:JsonObject={};
  for(const key of allowed)if(value[key]!==undefined){if(typeof value[key]!=="boolean")throw new TypeError(`indicator ${key} deve ser boolean`);out[key]=value[key]}
  return out;
}
function normalizedAuthorizationContext(value:any){
  if(value===undefined||value===null)return null;
  if(!plain(value)||value.kind!=="registered-workflow")throw new TypeError("reasoning authorizationContext invalido");
  const allowed=new Set(["kind","proposalId","proposalHash","planHash","workflowDefinitionHash","bindingHash"]);
  for(const key of Object.keys(value))if(!allowed.has(key))throw new TypeError(`authorizationContext campo nao permitido: ${key}`);
  const proposalId=safeId(value.proposalId,"authorizationContext.proposalId");
  for(const key of ["proposalHash","planHash","workflowDefinitionHash","bindingHash"])if(!HASH.test(String(value[key]??"")))throw new TypeError(`authorizationContext.${key} invalido`);
  return Object.freeze({kind:"registered-workflow",proposalId,proposalHash:String(value.proposalHash),planHash:String(value.planHash),workflowDefinitionHash:String(value.workflowDefinitionHash),bindingHash:String(value.bindingHash)});
}

export class ReasoningOutputReviewGate{
  readonly queue:HumanReviewQueue;
  readonly gate:ReviewGatedContinuation;
  readonly defaultPrivacyClass:string;
  readonly maxPersistedOutputBytes:number;

  constructor(queue:HumanReviewQueue,options:ReasoningOutputReviewOptions={}){
    if(!(queue instanceof HumanReviewQueue))throw new TypeError("HumanReviewQueue obrigatoria");
    this.queue=queue;
    this.gate=new ReviewGatedContinuation(queue);
    const privacyClass=String(options.defaultPrivacyClass??"restricted").trim().toLowerCase();
    if(!PRIVACY_CLASSES.has(privacyClass))throw new TypeError("defaultPrivacyClass invalida");
    this.defaultPrivacyClass=privacyClass;
    const limit=Number(options.maxPersistedOutputBytes??DEFAULT_REASONING_REVIEW_OUTPUT_LIMIT);
    if(!Number.isSafeInteger(limit)||limit<1024||limit>256*1024)throw new RangeError("maxPersistedOutputBytes deve estar entre 1024 e 262144");
    this.maxPersistedOutputBytes=limit;
  }

  async materialize(result:any,options:ReasoningOutputClassificationOptions={}){
    const normalized=normalizeReasoning(result);
    const reasoning=normalized.reasoning;
    const requestId=safeId(reasoning.requestId,"reasoning.requestId");
    const payloadId=safeId(reasoning.payloadId,"reasoning.payloadId");
    if(reasoning.status!=="completed")throw new Error("reasoning output review exige status completed");
    safeId(reasoning.providerId,"reasoning.providerId");
    if(!HASH.test(String(reasoning.providerDescriptorHash??"")))throw new Error("reasoning providerDescriptorHash invalido");
    if(!HASH.test(String(reasoning.transportDecisionHash??"")))throw new Error("reasoning transportDecisionHash invalido");
    if(!HASH.test(String(reasoning.payloadHash??"")))throw new Error("reasoning payloadHash invalido");
    if(normalized.executionEvidenceHash!==null&&!HASH.test(String(normalized.executionEvidenceHash)))throw new Error("reasoning executionEvidenceHash invalido");
    if(normalized.resultHash!==null&&!HASH.test(String(normalized.resultHash)))throw new Error("reasoning resultHash invalido");
    if(reasoning.humanReviewRequired!==true)throw new Error("reasoning output review exige humanReviewRequired=true");
    if(reasoning.coreMutationPerformed!==false)throw new Error("reasoning output review recusa resultado com Core mutation");
    if(reasoning.privacyReclassificationRequired!==true)throw new Error("reasoning output review exige privacyReclassificationRequired=true");

    const output=jsonOutput(reasoning.output);
    const outputHash=sha256(output.value);
    const privacyClass=String(options.privacyClass??this.defaultPrivacyClass).trim().toLowerCase();
    if(!PRIVACY_CLASSES.has(privacyClass))throw new TypeError("reasoning output privacyClass invalida");
    const authorizationContext=normalizedAuthorizationContext(options.authorizationContext);
    const sourceRefs=[
      `reasoning-request:${requestId}`,
      `reasoning-payload-hash:${reasoning.payloadHash}`,
      ...(authorizationContext?[`workflow-proposal:${authorizationContext.proposalId}`,`workflow-plan-hash:${authorizationContext.planHash}`]:[]),
      ...(Array.isArray(options.sourceRefs)?options.sourceRefs:[])
    ];
    const classification=classifyPrivacyRecord({
      recordId:`reasoning-output.${sha256(requestId).slice(0,64)}`,
      subjectType:options.subjectType??"mixed",
      sourceType:"internal-derived",
      privacyClass,
      purpose:"Reasoning output reclassification before substantive use",
      sourceRefs,
      indicators:normalizedIndicators(options.indicators),
      legalReviewState:options.legalReviewState??"not-assessed"
    });
    if(!verifyPrivacyClassification(classification))throw new Error("reasoning output privacy classification invalida");

    const outputPersistedInReview=output.bytes<=this.maxPersistedOutputBytes;
    const payload:JsonObject={
      reasoning:{
        requestId,
        payloadId,
        providerId:reasoning.providerId??null,
        providerDescriptorHash:reasoning.providerDescriptorHash??null,
        transportId:reasoning.transportId??null,
        transportDecisionHash:reasoning.transportDecisionHash??null,
        payloadHash:reasoning.payloadHash??null,
        executionEvidenceHash:normalized.executionEvidenceHash,
        resultHash:normalized.resultHash
      },
      privacyClassification:classification,
      outputHash,
      outputBytes:output.bytes,
      outputPersistedInReview,
      outputOmitted:!outputPersistedInReview,
      ...(authorizationContext?{authorizationContext}:{})
    };
    if(outputPersistedInReview)payload.output=output.value;

    const review=await this.queue.submit({
      kind:"reasoning.output",
      title:authorizationContext?`Reasoning output ${requestId} may release workflow ${authorizationContext.proposalId}`:`Reasoning output ${requestId} requires human review`,
      summary:authorizationContext
        ?"Semantic reasoning completed and was reclassified. An approval can release only the hash-bound registered workflow shown in authorizationContext; review the output and workflow binding together."
        :"Semantic reasoning completed. The output was reclassified and must be reviewed before substantive continuation, publication or Core mutation.",
      priority:priorityFor(classification.privacyClass,classification.indicators),
      source:{system:"reasoning",requestId,findingId:"reasoning-output"},
      payload,
      recommendations:[
        "Review factual support, uncertainty and potentially adverse inferences.",
        "Confirm the privacy classification before any broader routing or publication.",
        ...(authorizationContext?["Confirm proposalId, planHash and workflowDefinitionHash before approving the bound continuation."]:[]),
        "Approve only the substantive continuation intended by this request."
      ],
      idempotencyKey:`reasoning-output:${requestId}:${outputHash}:${authorizationContext?.bindingHash??"unbound"}`
    });
    const reconciled=await this.gate.reconcileRequest(requestId);
    return Object.freeze({
      format:ARCA_REASONING_OUTPUT_REVIEW_FORMAT,
      version:"1.0.0",
      requestId,
      payloadId,
      outputHash,
      outputBytes:output.bytes,
      outputPersistedInReview,
      classification,
      review,
      gate:reconciled.gate,
      continuationPointer:reconciled.pointer
    });
  }

  async status(requestId:string){return this.gate.status(safeId(requestId,"requestId"))}
  async reconcile(requestId:string){return this.gate.reconcileRequest(safeId(requestId,"requestId"))}
}
