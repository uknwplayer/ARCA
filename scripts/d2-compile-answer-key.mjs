#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildBlindCorpusManifest } from "../packages/aie/src/index.ts";

const [corpusArg,reviewArg,outArg]=process.argv.slice(2);
if(!corpusArg||!reviewArg||!outArg) throw new Error("uso: node scripts/d2-compile-answer-key.mjs CORPUS REVIEW OUT");
const corpus=JSON.parse(await readFile(resolve(corpusArg),"utf8"));
const review=JSON.parse(await readFile(resolve(reviewArg),"utf8"));
const manifest=buildBlindCorpusManifest(corpus);
if(review?.format!=="arca-d2-human-review-template-v1") throw new Error("formato de revisao invalido");
if(review.corpusId!==manifest.corpusId) throw new Error("revisao pertence a outro corpusId");
if(review.corpusFingerprint!==manifest.corpusFingerprint) throw new Error("revisao pertence a outro corpus fingerprint");
if(!Array.isArray(review.reviews)) throw new Error("reviews deve ser array");
const expectedIds=manifest.samples.map(x=>x.sampleId).sort();
const ALLOWED_DETECTOR_IDS=new Set([
 "RISK-ADDITIVE-BURDEN-001",
 "RISK-CONCENTRATION-001",
 "RISK-LOW-COMPETITION-001",
 "RISK-PRICE-OUTLIER-001",
 "RISK-COMPARABLE-UNIT-PRICE-001"
]);
const EVIDENCE_REF=/^public:[A-Za-z0-9._-]{1,120}(?:#[A-Za-z0-9._:-]{1,160})?$/;
const seen=new Set(), expectations=[];
for(const entry of review.reviews){
 const id=String(entry?.sampleId||"").trim();
 if(!expectedIds.includes(id)) throw new Error(`sample desconhecido: ${id||"<vazio>"}`);
 if(seen.has(id)) throw new Error(`sample duplicado: ${id}`); seen.add(id);
 if(entry.reviewComplete!==true) throw new Error(`revisao incompleta: ${id}`);
 if(typeof entry.reviewerRationale!=="string"||!entry.reviewerRationale.trim()) throw new Error(`reviewerRationale obrigatorio: ${id}`);
 if(!Array.isArray(entry.evidenceRefs)||entry.evidenceRefs.length===0) throw new Error(`evidenceRefs obrigatorio: ${id}`);
 if(!Array.isArray(entry.expectedDetectorIds)) throw new Error(`expectedDetectorIds deve ser array: ${id}`);
 const detectors=[...new Set(entry.expectedDetectorIds.map(x=>String(x).trim()).filter(Boolean))].sort();
 for(const detectorId of detectors) if(!ALLOWED_DETECTOR_IDS.has(detectorId)) throw new Error(`detectorId nao permitido: ${detectorId}`);
 const refs=[...new Set(entry.evidenceRefs.map(x=>String(x).trim()).filter(Boolean))];
 if(refs.length===0) throw new Error(`evidenceRefs vazio: ${id}`);
 for(const ref of refs){
  if(!EVIDENCE_REF.test(ref)) throw new Error(`evidenceRef invalida: ${id}`);
  const referencedSample=ref.slice("public:".length).split("#",1)[0];
  if(referencedSample!==id) throw new Error(`evidenceRef pertence a outro sample: ${id}`);
 }
 expectations.push({sampleId:id,expectedDetectorIds:detectors,allowAdditionalDetectors:entry.allowAdditionalDetectors===true});
}
if(seen.size!==expectedIds.length||expectedIds.some(id=>!seen.has(id))) throw new Error("revisao deve cobrir exatamente todos os samples do corpus");
expectations.sort((a,b)=>a.sampleId.localeCompare(b.sampleId));
const answerKey={format:"arca-aie-blind-procurement-answer-key-v1",corpusId:manifest.corpusId,expectations};
await mkdir(dirname(resolve(outArg)),{recursive:true});
await writeFile(resolve(outArg),JSON.stringify(answerKey,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({ok:true,corpusId:manifest.corpusId,corpusFingerprint:manifest.corpusFingerprint,expectationCount:expectations.length,out:resolve(outArg)}));
