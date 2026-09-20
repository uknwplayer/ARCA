#!/usr/bin/env node
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createPublicationPlan,loadPublicationPolicy,writePublicationPreview} from "../src/publication-boundary.mjs";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const args=process.argv.slice(2);
const mode=args.includes("--preview")?"preview":"check";
const outIndex=args.indexOf("--out");
const outDir=outIndex>=0&&args[outIndex+1]?resolve(args[outIndex+1]):resolve(root,".arca-publication-preview");
const policyPath=resolve(root,"config/publication-boundary-v1.json");
const policy=await loadPublicationPolicy(policyPath);
const sourceSha=process.env.GITHUB_SHA||"working-tree";

if(mode==="check"){
  const plan=await createPublicationPlan({root,policy,sourceSha});
  const summary={
    format:"arca-publication-boundary-check-v1",
    ok:plan.ok,
    sourceSha,
    includedFiles:plan.manifest.fileCount,
    excludedFiles:plan.excluded.length,
    violations:plan.violations,
    contentRootHash:plan.manifest.contentRootHash,
    policyHash:plan.manifest.policyHash,
    manifestHash:plan.manifest.manifestHash,
    creatorApprovalRequired:true,
    publicationPerformed:false
  };
  process.stdout.write(JSON.stringify(summary,null,2)+"\n");
  if(!plan.ok)process.exitCode=1;
}else{
  const result=await writePublicationPreview({root,outDir,policy,sourceSha});
  process.stdout.write(JSON.stringify({
    format:"arca-publication-preview-v1",
    ok:true,
    output:result.target,
    sourceSha,
    files:result.plan.manifest.fileCount,
    totalBytes:result.plan.manifest.totalBytes,
    contentRootHash:result.plan.manifest.contentRootHash,
    manifestHash:result.plan.manifest.manifestHash,
    creatorApprovalRequired:true,
    creatorApprovalRecorded:false,
    publicationPerformed:false,
    repositoryCreated:false
  },null,2)+"\n");
}
