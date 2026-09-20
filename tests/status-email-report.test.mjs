import test from "node:test";
import assert from "node:assert/strict";
import {formatArcaStatusReport,createStatusReplyToken} from "../src/machine-bridge/status-email-report.mjs";

test("status report summarizes PRs, workflows and inert wakeup probe",()=>{
  const report=formatArcaStatusReport({
    repository:"owner/repo",
    generatedAt:"2026-09-19T17:00:00.000Z",
    mainSha:"a".repeat(40),
    checkpointText:"**SHA canônico observado:** `abc`",
    pullRequests:[
      {number:141,state:"open",draft:true,title:"test(work): WORK-WAKEUP-PROBE-V1"},
      {number:149,state:"open",draft:false,title:"feat: next"}
    ],
    workflowRuns:[
      {name:"CI",run_number:1,status:"completed",conclusion:"success"},
      {name:"Bridge",run_number:2,status:"in_progress",conclusion:null}
    ],
    wakeupPr:{state:"open",draft:true,head:{sha:"b".repeat(40)}}
  });
  assert.match(report.subject,/\[ARCA STATUS\]/);
  assert.match(report.markdown,/PRs abertos: 2/);
  assert.match(report.markdown,/workflows recentes em andamento\/fila: 1/);
  assert.match(report.markdown,/PR #141: open \/ draft/);
  assert.match(report.markdown,/não arma nem dispara o probe/);
});

test("reply token is deterministic, bounded and disabled without a secret",()=>{
  assert.equal(createStatusReplyToken({secret:"short",reportId:"x"}),null);
  const a=createStatusReplyToken({secret:"0123456789abcdef0123456789abcdef",reportId:"owner/repo:date:sha"});
  const b=createStatusReplyToken({secret:"0123456789abcdef0123456789abcdef",reportId:"owner/repo:date:sha"});
  assert.equal(a,b);
  assert.match(a,/^[0-9a-f]{20}$/);
});

test("status report never prints a command token when none is configured",()=>{
  const report=formatArcaStatusReport({
    repository:"owner/repo",
    generatedAt:"2026-09-19T17:00:00.000Z",
    mainSha:"abc",
    pullRequests:[],
    workflowRuns:[]
  });
  assert.doesNotMatch(report.markdown,/Token deste relatório/);
});
