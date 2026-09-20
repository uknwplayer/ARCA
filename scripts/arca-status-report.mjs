#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {formatArcaStatusReport,createStatusReplyToken} from "../src/machine-bridge/status-email-report.mjs";

const token=process.env.GITHUB_TOKEN;
const repository=process.env.GITHUB_REPOSITORY;
if(!repository) throw new Error("GITHUB_REPOSITORY required");

async function api(route){
  if(!token) throw new Error("GITHUB_TOKEN required");
  const response=await fetch(`https://api.github.com/repos/${repository}${route}`,{
    headers:{
      accept:"application/vnd.github+json",
      authorization:`Bearer ${token}`,
      "x-github-api-version":"2022-11-28",
      "user-agent":"arca-status-report"
    }
  });
  if(!response.ok) throw new Error(`GitHub API ${response.status} for ${route}`);
  return response.json();
}

const [repoInfo,pulls,runs,wakeupPr]=await Promise.all([
  api(""),
  api("/pulls?state=open&per_page=50"),
  api("/actions/runs?per_page=20"),
  api("/pulls/141").catch(()=>null)
]);

const mainRef=await api(`/git/ref/heads/${encodeURIComponent(repoInfo.default_branch??"main")}`);
const checkpointPath=path.join(process.cwd(),"project-history","checkpoints","LATEST.md");
const checkpointText=fs.existsSync(checkpointPath)?fs.readFileSync(checkpointPath,"utf8"):"";

const generatedAt=new Date().toISOString();
const provisional=formatArcaStatusReport({
  repository,
  generatedAt,
  mainSha:mainRef.object?.sha,
  checkpointText,
  pullRequests:pulls,
  workflowRuns:runs.workflow_runs??[],
  wakeupPr
});
const replyToken=createStatusReplyToken({
  secret:process.env.ARCA_EMAIL_COMMAND_KEY,
  reportId:provisional.reportId
});
const report=formatArcaStatusReport({
  repository,
  generatedAt,
  mainSha:mainRef.object?.sha,
  checkpointText,
  pullRequests:pulls,
  workflowRuns:runs.workflow_runs??[],
  wakeupPr,
  replyToken
});

const outDir=path.resolve(process.env.ARCA_STATUS_OUT??".arca-status");
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,"status.md"),report.markdown,"utf8");
fs.writeFileSync(path.join(outDir,"status.json"),JSON.stringify({
  schema:"arca-status-report-v1",
  generatedAt,
  repository,
  reportId:report.reportId,
  subject:report.subject,
  replyToken,
  ...report.summary
},null,2)+"\n","utf8");
fs.writeFileSync(path.join(outDir,"email-subject.txt"),report.subject+"\n","utf8");
process.stdout.write(report.markdown);
