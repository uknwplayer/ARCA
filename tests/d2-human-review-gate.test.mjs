import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const corpus={format:"arca-aie-blind-procurement-corpus-v1",corpusId:"D2-GATE-TEST",samples:[
 {sampleId:"S-1",records:[{id:"R1",amount:10}],items:[],metadata:{}},
 {sampleId:"S-2",records:[{id:"R2",amount:20}],items:[],metadata:{}}
]};
async function setup(){
 const d=await mkdtemp(join(tmpdir(),"arca-d2-gate-")), cp=join(d,"corpus.json"), rp=join(d,"review.json"), out=join(d,"key.json");
 await writeFile(cp,JSON.stringify(corpus));
 let x=spawnSync(process.execPath,["scripts/d2-human-review-template.mjs",cp,rp],{encoding:"utf8"});
 assert.equal(x.status,0,x.stderr);
 return {d,cp,rp,out,review:JSON.parse(await readFile(rp,"utf8"))};
}
function compile(x){return spawnSync(process.execPath,["scripts/d2-compile-answer-key.mjs",x.cp,x.rp,x.out],{encoding:"utf8"})}
function complete(r){for(const e of r.reviews){e.reviewComplete=true;e.reviewerRationale="Revisao independente dos dados da amostra.";e.evidenceRefs=[`public:${e.sampleId}`]}}
async function save(x){await writeFile(x.rp,JSON.stringify(x.review))}

test("D2 gate compila somente revisao completa com cobertura exata",async()=>{const x=await setup();complete(x.review);await save(x);const p=compile(x);assert.equal(p.status,0,p.stderr);const k=JSON.parse(await readFile(x.out,"utf8"));assert.equal(k.expectations.length,2)});
test("D2 gate recusa fingerprint adulterado",async()=>{const x=await setup();complete(x.review);x.review.corpusFingerprint="BLINDCORPUS-ALTERADO";await save(x);const p=compile(x);assert.notEqual(p.status,0);assert.match(p.stderr,/outro corpus fingerprint/)});
test("D2 gate recusa amostra omitida",async()=>{const x=await setup();complete(x.review);x.review.reviews.pop();await save(x);const p=compile(x);assert.notEqual(p.status,0);assert.match(p.stderr,/cobrir exatamente/)});
test("D2 gate recusa revisao incompleta",async()=>{const x=await setup();complete(x.review);x.review.reviews[0].reviewComplete=false;await save(x);const p=compile(x);assert.notEqual(p.status,0);assert.match(p.stderr,/revisao incompleta/)});
test("D2 gate recusa amostra externa",async()=>{const x=await setup();complete(x.review);x.review.reviews[0].sampleId="S-EXTERNA";await save(x);const p=compile(x);assert.notEqual(p.status,0);assert.match(p.stderr,/sample desconhecido/)});
test("D2 gate exige justificativa e evidencia",async()=>{const x=await setup();complete(x.review);x.review.reviews[0].evidenceRefs=[];await save(x);const p=compile(x);assert.notEqual(p.status,0);assert.match(p.stderr,/evidenceRefs obrigatorio/)});

test("D2 semantic attack: gate atualmente aceita detector ID arbitrario nao comprometido",async()=>{
 const x=await setup();complete(x.review);
 x.review.reviews[0].expectedDetectorIds=["DETECTOR-INEXISTENTE-SEM-CATALOGO"];
 await save(x);
 const p=compile(x);
 assert.notEqual(p.status,0,"VULNERABILIDADE: compilador aceitou detector ID arbitrario sem catalogo/compromisso semantico");
});

test("D2 semantic attack: gate atualmente aceita evidenceRef opaca sem vinculacao verificavel",async()=>{
 const x=await setup();complete(x.review);
 x.review.reviews[0].evidenceRefs=["qualquer-texto-nao-verificavel"];
 await save(x);
 const p=compile(x);
 assert.notEqual(p.status,0,"VULNERABILIDADE: compilador aceitou evidenceRef opaca sem esquema ou vinculacao a amostra");
});
