import test from "node:test";
import assert from "node:assert/strict";
import {
  M5_O1_ENDPOINT_ID,
  M5_O1_WINDOW_DAYS,
  buildM5O1ContractPublicationPlan,
  buildM5O1ContractPublicationCandidate
} from "../src/investigation/m5-o1-pncp-contract-publication-plan.mjs";

function rec({
  control="12345678000199-1-42/2026",
  cnpj="12345678000199",
  publishedAt="2026-01-10",
  recordRef="pncp:control:sha256:"+"a".repeat(64)
}={}){
  return {
    schema:"arca.m5-pncp-live-parser.v1",
    recordRef,
    procurementControlNumber:control,
    agencyIdentifier:{namespace:"CNPJ",value:cnpj},
    publishedAt,
    supplierObserved:false,
    identityInferencesMade:false
  };
}

test("M5-O1 preserva as duas contratações e produz consultas públicas limitadas",()=>{
  const records=[
    rec(),
    rec({
      control:"98765432000188-1-7/2026",
      cnpj:"98765432000188",
      publishedAt:"2026-02-20",
      recordRef:"pncp:control:sha256:"+"b".repeat(64)
    })
  ];
  const p=buildM5O1ContractPublicationPlan({records,asOfDate:"2026-09-24"});
  assert.equal(p.endpointId,M5_O1_ENDPOINT_ID);
  assert.equal(p.targetCount,2);
  assert.equal(p.budgets.maxRequests,2);
  assert.equal(p.budgets.retries,0);
  assert.equal(p.selectionPolicy.windowDays,M5_O1_WINDOW_DAYS);
  assert.equal(p.selectionPolicy.exactProcurementLinkField,"numeroControlePNCPCompra");
  assert.deepEqual(p.selectionPolicy.supplierFieldsExpected,["niFornecedor","nomeRazaoSocialFornecedor"]);
  assert.equal(p.getCostPolicy.executionState,"AUTO_EXECUTION_ALLOWED");
  assert.equal(p.getCostPolicy.humanAuthorizationRequired,false);
  assert.equal(p.sourceNetworkAuthorized,false);
  assert.equal(p.newPncpGetAuthorized,false);
  for(const t of p.targets){
    assert.equal(t.path,"/api/consulta/v1/contratos");
    assert.equal(t.query.pagina,1);
    assert.match(t.query.dataInicial,/^\d{8}$/);
    assert.match(t.query.dataFinal,/^\d{8}$/);
    assert.match(t.query.cnpjOrgao,/^\d{14}$/);
    assert.equal(t.exactMatchField,"numeroControlePNCPCompra");
    assert.match(t.targetSha256,/^[a-f0-9]{64}$/);
  }
});

test("M5-O1 agrupa GET idêntico sem duplicar request",()=>{
  const p=buildM5O1ContractPublicationPlan({
    records:[
      rec(),
      rec({
        control:"12345678000199-1-43/2026",
        recordRef:"pncp:control:sha256:"+"c".repeat(64)
      })
    ],
    asOfDate:"2026-09-24"
  });
  assert.equal(p.targetCount,1);
  assert.equal(p.budgets.maxRequests,1);
  assert.equal(p.targets[0].procurementRecordRefs.length,2);
  assert.equal(p.targets[0].procurementControlRefs.length,2);
});

test("M5-O1 limita janela pela data as-of e não olha para o futuro",()=>{
  const p=buildM5O1ContractPublicationPlan({
    records:[
      rec({publishedAt:"2026-09-01"}),
      rec({
        control:"98765432000188-1-7/2026",
        cnpj:"98765432000188",
        publishedAt:"2026-09-20",
        recordRef:"pncp:control:sha256:"+"d".repeat(64)
      })
    ],
    asOfDate:"2026-09-24"
  });
  assert.deepEqual(
    p.targets.map(x=>x.query.dataFinal).sort(),
    ["20260924","20260924"]
  );
  assert.throws(()=>buildM5O1ContractPublicationPlan({
    records:[rec({publishedAt:"2026-09-25"}),rec()],
    asOfDate:"2026-09-24"
  }),/RECORD_AFTER_AS_OF/);
});

test("M5-O1 falha fechado se fornecedor já tiver sido inferido/observado",()=>{
  const bad=rec();
  bad.supplierObserved=true;
  assert.throws(()=>buildM5O1ContractPublicationPlan({
    records:[bad,rec({recordRef:"pncp:control:sha256:"+"e".repeat(64)})],
    asOfDate:"2026-09-24"
  }),/PNCP_RECORD_INVALID/);
});

test("candidato M5-O1 publica somente hashes e continua sem rede",()=>{
  const plan=buildM5O1ContractPublicationPlan({
    records:[
      rec(),
      rec({
        control:"98765432000188-1-7/2026",
        cnpj:"98765432000188",
        publishedAt:"2026-02-20",
        recordRef:"pncp:control:sha256:"+"f".repeat(64)
      })
    ],
    asOfDate:"2026-09-24"
  });
  const c=buildM5O1ContractPublicationCandidate({
    plan,
    revision:"1".repeat(40),
    pncpBindingSha256:"2".repeat(64),
    screeningSha256:"3".repeat(64),
    m5n1ObservationSha256:"4".repeat(64)
  });
  assert.equal(c.status,"READY_FOR_TRANSPORT_IMPLEMENTATION");
  assert.equal(c.privateTargetValuesIncluded,false);
  assert.equal(c.sourceNetworkAuthorized,false);
  assert.equal(c.humanAuthorizationRequired,false);
  assert.equal(c.targetHashes.length,plan.targetCount);
  const serialized=JSON.stringify(c);
  assert.doesNotMatch(serialized,/12345678000199|98765432000188/);
});
