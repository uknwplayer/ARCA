#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildBlindCorpusManifest } from "../packages/aie/src/index.ts";

const [corpusArg,outArg]=process.argv.slice(2);
if(!corpusArg||!outArg) throw new Error("uso: node scripts/d2-human-review-template.mjs CORPUS OUT");
const corpusPath=resolve(corpusArg),outPath=resolve(outArg);
const corpus=JSON.parse(await readFile(corpusPath,"utf8"));
const manifest=buildBlindCorpusManifest(corpus);
const template={
 format:"arca-d2-human-review-template-v1",
 corpusId:manifest.corpusId,
 corpusFingerprint:manifest.corpusFingerprint,
 generatedAt:new Date().toISOString(),
 instructions:{
  independence:"Revisar somente os dados publicos da amostra; nao consultar saidas dos detectores ARCA.",
  semantics:"expectedDetectorIds representa sinais que um detector deveria sinalizar para revisao, nao fraude, culpa ou ilegalidade.",
  emptyAllowed:true,
  evidenceRequiredBeforeCommitment:true
 },
 reviews:manifest.samples.map(s=>({
  sampleId:s.sampleId,
  recordCount:s.recordCount,
  itemCount:s.itemCount,
  expectedDetectorIds:[],
  allowAdditionalDetectors:false,
  reviewerRationale:"",
  evidenceRefs:[],
  reviewComplete:false
 }))
};
await mkdir(dirname(outPath),{recursive:true});
await writeFile(outPath,JSON.stringify(template,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({ok:true,corpusId:manifest.corpusId,corpusFingerprint:manifest.corpusFingerprint,sampleCount:manifest.sampleCount,out:outPath}));
