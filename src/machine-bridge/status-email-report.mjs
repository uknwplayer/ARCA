import {createHmac} from "node:crypto";

function text(value,fallback="unknown"){
  return typeof value==="string"&&value.trim()?value.trim():fallback;
}
function shortSha(value){
  const v=text(value,"unknown");
  return v==="unknown"?v:v.slice(0,12);
}
function statusIcon(value){
  if(value==="success") return "✅";
  if(value==="failure"||value==="cancelled"||value==="timed_out") return "❌";
  if(value==="in_progress"||value==="queued"||value==="waiting") return "⏳";
  return "•";
}
function oneLine(value){
  return text(value,"").replace(/\s+/g," ").trim();
}

export function createStatusReplyToken({secret,reportId}={}){
  if(typeof secret!=="string"||secret.length<16) return null;
  if(typeof reportId!=="string"||!reportId) throw new Error("ARCA_STATUS_REPORT_ID_REQUIRED");
  return createHmac("sha256",secret).update(reportId).digest("hex").slice(0,20);
}

export function formatArcaStatusReport({
  repository,
  generatedAt,
  mainSha,
  checkpointText="",
  pullRequests=[],
  workflowRuns=[],
  wakeupPr=null,
  replyToken=null
}={}){
  if(typeof repository!=="string"||!repository) throw new Error("ARCA_STATUS_REPOSITORY_REQUIRED");
  const when=new Date(generatedAt??Date.now());
  if(!Number.isFinite(when.getTime())) throw new Error("ARCA_STATUS_TIME_INVALID");

  const openPrs=pullRequests.filter(pr=>pr?.state==="open");
  const recentRuns=workflowRuns.slice(0,8);
  const failed=recentRuns.filter(run=>["failure","cancelled","timed_out"].includes(run?.conclusion));
  const running=recentRuns.filter(run=>["in_progress","queued","waiting"].includes(run?.status));

  const checkpointLines=String(checkpointText).split(/\r?\n/).filter(Boolean);
  const checkpointHeadline=checkpointLines.find(line=>line.startsWith("**SHA canônico"))??checkpointLines.find(line=>line.startsWith("**Data/hora"))??"checkpoint disponível no repositório";

  const lines=[
    "# ARCA — Status periódico",
    "",
    `Gerado em: ${when.toISOString()}`,
    `Repositório: ${repository}`,
    `main: ${shortSha(mainSha)}`,
    "",
    "## Resumo",
    "",
    `- PRs abertos: ${openPrs.length}`,
    `- workflows recentes em andamento/fila: ${running.length}`,
    `- workflows recentes com falha/cancelamento: ${failed.length}`,
    `- checkpoint: ${oneLine(checkpointHeadline)}`,
    "",
    "## Pull requests abertos",
    ""
  ];

  if(openPrs.length===0) lines.push("- nenhum");
  else for(const pr of openPrs.slice(0,12)){
    lines.push(`- #${pr.number} ${pr.draft?"[draft] ":""}${oneLine(pr.title)}`);
  }

  lines.push("","## Workflows recentes","");
  if(recentRuns.length===0) lines.push("- nenhum workflow retornado");
  else for(const run of recentRuns){
    lines.push(`- ${statusIcon(run.conclusion??run.status)} ${oneLine(run.name)} #${run.run_number??"?"}: ${run.conclusion??run.status??"unknown"}`);
  }

  lines.push("","## WORK-WAKEUP-PROBE-V1","");
  if(!wakeupPr){
    lines.push("- PR #141 não localizado; verificar manualmente.");
  }else{
    lines.push(`- PR #141: ${wakeupPr.state}${wakeupPr.draft?" / draft":""}`);
    lines.push(`- head: ${shortSha(wakeupPr.head?.sha??wakeupPr.head_sha)}`);
    lines.push("- o relatório não arma nem dispara o probe.");
  }

  lines.push("","## Próxima atenção","");
  if(failed.length){
    lines.push("- Existe workflow recente com falha/cancelamento; revisar antes de ampliar automação.");
  }else if(running.length){
    lines.push("- Existem workflows em execução/fila; aguardar conclusão antes de interpretar o estado como estável.");
  }else{
    lines.push("- Nenhuma falha recente detectada no recorte consultado.");
  }

  if(replyToken){
    lines.push(
      "",
      "## Canal de resposta (pré-protocolo)",
      "",
      `Token deste relatório: ${replyToken}`,
      "",
      "Responder este e-mail ainda NÃO executa comandos automaticamente.",
      "O token existe para a futura etapa de ingestão autenticada de respostas.",
      "Quando ativada, a primeira versão aceitará respostas somente como pedidos auditáveis/reviewáveis, nunca como shell ou merge direto."
    );
  }

  lines.push(
    "",
    "---",
    "Relatório produzido pelo repositório ARCA. Conteúdo operacional; não contém secrets nem payload privado de investigação."
  );

  const reportId=`${repository}:${when.toISOString().slice(0,10)}:${text(mainSha)}`;
  const subject=`[ARCA STATUS] ${when.toISOString().slice(0,10)} main ${shortSha(mainSha)}`;
  return Object.freeze({
    reportId,
    subject,
    markdown:lines.join("\n")+"\n",
    summary:Object.freeze({
      openPullRequests:openPrs.length,
      runningWorkflows:running.length,
      failedWorkflows:failed.length,
      mainSha:text(mainSha)
    })
  });
}
