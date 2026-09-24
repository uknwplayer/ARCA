import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {diagnoseM5MHttp404Body,summarizeM5MHttp404Diagnosis} from "../src/investigation/m5-m-http404-diagnosis.mjs";
const h=b=>createHash("sha256").update(b).digest("hex");

test("M5-M 404 distingue ausência contratual de rota inexistente",()=>{
  const a=Buffer.from(JSON.stringify({status:404,error:"Not Found",message:"Nenhum contrato encontrado para a contratacao",path:"/pncp-api/v1/orgaos/12345678000199/contratos/contratacao/2026/1"}));
  const da=diagnoseM5MHttp404Body({bytes:a,expectedResponseSha256:h(a),targetSha256:"a".repeat(64)});
  assert.equal(da.diagnosis,"NO_LINKED_CONTRACT_OR_COMMITMENT_OBSERVED");
  const b=Buffer.from(JSON.stringify({status:404,error:"Not Found",message:"No static resource endpoint",path:"/pncp-api/v1/x"}));
  const db=diagnoseM5MHttp404Body({bytes:b,expectedResponseSha256:h(b),targetSha256:"b".repeat(64)});
  assert.equal(db.diagnosis,"ROUTE_OR_RESOURCE_NOT_FOUND");
  assert.equal(da.rawBodyIncluded,false);
});

test("M5-M 404 resumo prova zero request e zero correlação",()=>{
  const mk=(id)=>{
    const b=Buffer.from(JSON.stringify({status:404,error:"Not Found",message:"Nenhum contrato encontrado"}));
    return diagnoseM5MHttp404Body({bytes:b,expectedResponseSha256:h(b),targetSha256:id.repeat(64)});
  };
  const s=summarizeM5MHttp404Diagnosis({items:[mk("a"),mk("b")]});
  assert.equal(s.sourceRequestCount,0);
  assert.equal(s.sourceNetworkUsed,false);
  assert.equal(s.publicationAttempted,false);
  assert.equal(s.correlationAttempted,false);
  assert.equal(s.rawBodiesIncluded,false);
  assert.match(s.diagnosisSha256,/^[a-f0-9]{64}$/);
});
