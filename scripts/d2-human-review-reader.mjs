#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildBlindCorpusManifest } from "../packages/aie/src/index.ts";

const [corpusArg,sampleArg]=process.argv.slice(2);
if(!corpusArg) throw new Error("uso: node scripts/d2-human-review-reader.mjs CORPUS [SAMPLE_ID]");
const corpus=JSON.parse(await readFile(resolve(corpusArg),"utf8"));
const manifest=buildBlindCorpusManifest(corpus);
const samples=sampleArg==="--index"?[]:sampleArg?corpus.samples.filter(s=>s.sampleId===sampleArg):corpus.samples;
if(sampleArg&&sampleArg!=="--index"&&samples.length!==1)throw new Error("sample inexistente");
const forbidden=new Set(["answerKey","expected","expectedDetectorIds","groundTruth","label","labels","truth","findings","audits","materialDetectorIds","procurementProfile","itemComparabilityProfile"]);
function clean(v){
 if(Array.isArray(v))return v.map(clean);
 if(!v||typeof v!=="object")return v;
 const o={};for(const [k,x] of Object.entries(v)){if(!forbidden.has(k))o[k]=clean(x)}return o;
}
const out={
 format:"arca-d2-human-review-reader-v1",
 corpusId:manifest.corpusId,
 corpusFingerprint:manifest.corpusFingerprint,
 detectorOutputsIncluded:false,
 answerKeyIncluded:false,
 sampleIndex: sampleArg==="--index"?corpus.samples.map((s,i)=>({ordinal:i+1,sampleId:s.sampleId})):undefined,
 samples:samples.map(s=>({
  sampleId:s.sampleId,
  evidenceRefPrefix:`public:${s.sampleId}`,
  recordCount:Array.isArray(s.records)?s.records.length:0,
  itemCount:Array.isArray(s.items)?s.items.length:0,
  metadata:clean(s.metadata??{}),
  records:clean(s.records??[]),
  items:clean(s.items??[])
 }))
};
process.stdout.write(JSON.stringify(out,null,2)+"\n");
