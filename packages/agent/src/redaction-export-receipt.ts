import {createHash} from "node:crypto";
import {ARCA_PUBLICATION_DECISION_FORMAT,verifyPublicationDecision} from "./publication-gate.ts";

export const ARCA_REDACTION_EXPORT_RECEIPT_FORMAT="arca-redaction-export-receipt-v1";
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,160}$/;
const SHA=/^[a-f0-9]{64}$/;
function plain(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
function clone(v){return JSON.parse(JSON.stringify(v))}
function text(v,f,max,{required=true}={}){const s=String(v??"").trim();if(required&&!s)throw new TypeError(`${f} obrigatorio`);if(s.length>max)throw new RangeError(`${f} excede ${max} caracteres`);return s}
function id(v,f){const s=text(v,f,160);if(!IDENTIFIER.test(s))throw new TypeError(`${f} invalido`);return s}
function sha(v,f){const s=text(v,f,64);if(!SHA.test(s))throw new TypeError(`${f} deve ser sha256`);return s}
function iso(v=new Date().toISOString()){const d=new Date(v);if(Number.isNaN(d.getTime()))throw new TypeError("timestamp invalido");return d.toISOString()}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(plain(v)){const o={};for(const k of Object.keys(v).sort())if(v[k]!==undefined)o[k]=canonical(v[k]);return o}return v}
function hash(v){return createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex")}
function normalizeApplied(values=[]){if(!Array.isArray(values)||values.length>200)throw new TypeError("appliedRedactions invalido");const map=new Map();for(const raw of values){if(!plain(raw))throw new TypeError("redaction invalida");const field=text(raw.field,"redaction.field",240);map.set(field,{field,reason:text(raw.reason??"privacy-minimization","redaction.reason",240),replacement:text(raw.replacement??"[REDACTED]","redaction.replacement",120,{required:false})})}return [...map.values()].sort((a,b)=>a.field.localeCompare(b.field))}

export function createRedactionExportReceipt(input={},options={}){
  if(!plain(input))throw new TypeError("receipt input invalido");
  const decision=input.publicationDecision;
  if(!plain(decision)||decision.format!==ARCA_PUBLICATION_DECISION_FORMAT||!verifyPublicationDecision(decision))throw new Error("publication decision invalida ou adulterada");
  if(!["publish","publish-with-redaction"].includes(decision.action))throw new Error("decision nao autoriza exportacao");
  const applied=normalizeApplied(input.appliedRedactions??[]);
  const appliedFields=new Set(applied.map(r=>r.field));
  const requiredFields=new Set((decision.redactions??[]).map(r=>r.field));
  const missing=[...requiredFields].filter(f=>!appliedFields.has(f)).sort();
  if(missing.length)throw new Error(`redacoes obrigatorias ausentes: ${missing.join(",")}`);
  if(decision.action==="publish-with-redaction"&&!requiredFields.size)throw new Error("decision exige redacao mas nao lista campos");
  const inputHash=sha(input.inputArtifactSha256,"inputArtifactSha256");
  const outputHash=sha(input.outputArtifactSha256,"outputArtifactSha256");
  if(inputHash===outputHash&&applied.length)throw new Error("artefato redigido nao pode manter hash identico ao original");
  const payload={
    format:ARCA_REDACTION_EXPORT_RECEIPT_FORMAT,
    exportId:id(input.exportId,"exportId"),
    publicationId:decision.publicationId,
    decisionHash:decision.decisionHash,
    classificationHash:decision.classificationHash,
    inputArtifactSha256:inputHash,
    outputArtifactSha256:outputHash,
    appliedRedactions:applied,
    removedValueHashesStored:false,
    removedValuesStored:false,
    requiredRedactionsSatisfied:missing.length===0,
    exportPerformedBy:text(input.exportPerformedBy??"arca-exporter","exportPerformedBy",160),
    exportedAt:iso(options.exportedAt)
  };
  return Object.freeze({...clone(payload),receiptHash:hash(payload)});
}

export function verifyRedactionExportReceipt(receipt){if(!plain(receipt)||receipt.format!==ARCA_REDACTION_EXPORT_RECEIPT_FORMAT)return false;const {receiptHash,...payload}=receipt;return typeof receiptHash==="string"&&receiptHash===hash(payload)}
