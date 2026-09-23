import fs from "node:fs";
import path from "node:path";
import {createPublicSourceRegistry,sha256} from "../src/investigation/public-source-contract.mjs";
import {createOfflineTcuAcordaosAdapter,TCU_SOURCE_ID} from "../src/investigation/tcu-acordaos-offline-adapter.mjs";

const root=process.cwd();
const registry=createPublicSourceRegistry(JSON.parse(
  fs.readFileSync(path.join(root,"config","public-source-registry-s2.json"),"utf8")
));
const fixture=JSON.parse(
  fs.readFileSync(path.join(root,"examples","multisource-offline-fixtures","tcu-acordaos-national-v1.json"),"utf8")
);
const source=registry.get(TCU_SOURCE_ID);
const result=createOfflineTcuAcordaosAdapter().collect({source,fixture});

if(result.status!=="AVAILABLE"||result.jurisdiction!=="BR/NATIONAL"||result.records.length!==2)
  throw new Error("ARCA_TCU_S2_VALIDATION_FAILED");
if(result.records.some(item=>item.humanReviewRequired!==true||item.adverseFinding!==false||item.jurisdiction!=="BR/NATIONAL"))
  throw new Error("ARCA_TCU_S2_SAFETY_FAILED");

const proof={
  schema:"arca.tcu-acordaos-offline-s2-proof.v1",
  status:"PASS",
  sourceId:TCU_SOURCE_ID,
  jurisdiction:"BR/NATIONAL",
  recordCount:result.records.length,
  envelopeHashes:result.records.map(item=>item.envelopeSha256),
  networkUsed:false,
  publicationAttempted:false,
  humanReviewRequired:true,
  adverseFinding:false
};
console.log(JSON.stringify({...proof,proofSha256:sha256(proof)}));
