import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  classifyPublicationPath,
  createPublicationPlan,
  loadPublicationPolicy,
  normalizePublicationPolicy,
  scanPublicationContent,
  writePublicationPreview
} from "../src/publication-boundary.mjs";

const repoRoot=resolve(fileURLToPath(new URL("..",import.meta.url)));
const policyPath=resolve(repoRoot,"config/publication-boundary-v1.json");

test("Publication Boundary V1 is fail-closed and requires Creator approval",async()=>{
  const policy=await loadPublicationPolicy(policyPath);
  assert.equal(policy.defaultAction,"exclude");
  assert.equal(policy.historyMode,"fresh-root-only");
  assert.equal(policy.creatorApprovalRequired,true);
  assert.equal(policy.publicRepositoryCreationAllowed,false);
});

test("deny and hard-deny win over broad allow rules",()=>{
  const policy=normalizePublicationPolicy({
    format:"arca-publication-boundary-v1",
    version:"1.0.0",
    defaultAction:"exclude",
    historyMode:"fresh-root-only",
    creatorApprovalRequired:true,
    publicRepositoryCreationAllowed:false,
    allow:["**"],
    deny:["private/**"]
  });
  assert.equal(classifyPublicationPath("src/core.mjs",policy).action,"include");
  assert.equal(classifyPublicationPath("private/a.txt",policy).action,"exclude");
  assert.equal(classifyPublicationPath("remote-jobs/results/job.json",policy).reason,"hard-deny");
  assert.equal(classifyPublicationPath("project-history/STATE_AND_RECOVERY.md",policy).reason,"hard-deny");
  assert.equal(classifyPublicationPath(".github/workflows/arca-machine-bridge.yml",policy).reason,"operational-workflow");
});

test("unknown paths stay out of the public package",async()=>{
  const policy=await loadPublicationPolicy(policyPath);
  const result=classifyPublicationPath("operator-private-notes.txt",policy);
  assert.deepEqual({action:result.action,reason:result.reason},{action:"exclude",reason:"default-deny"});
});

test("content scanner catches credential material but ignores short test placeholders",async()=>{
  const policy=await loadPublicationPolicy(policyPath);
  assert.equal(scanPublicationContent("src/x.mjs",Buffer.from("const x='ghp_RAW_SECRET'"),policy).length,0);
  const token="ghp_"+"ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcd";
  const privateKeyMarker="-----BEGIN "+"PRIVATE KEY-----\\nabc";
  assert.equal(scanPublicationContent("src/x.mjs",Buffer.from("const x='"+token+"'"),policy)[0]?.kind,"secret-content");
  assert.equal(scanPublicationContent("src/x.mjs",Buffer.from(privateKeyMarker),policy)[0]?.rule,"private-key-block");
});

test("repository plan excludes operational state and keeps only the safe CI workflow",async()=>{
  const policy=await loadPublicationPolicy(policyPath);
  const plan=await createPublicationPlan({root:repoRoot,policy,sourceSha:"test-sha",generatedAt:"2026-09-20T00:00:00.000Z"});
  assert.equal(plan.ok,true,JSON.stringify(plan.violations));
  const included=new Set(plan.included.map(file=>file.path));
  assert.equal(included.has(".github/workflows/arca-ci.yml"),true);
  assert.equal(included.has(".github/workflows/arca-machine-bridge.yml"),false);
  assert.equal([...included].some(path=>path.startsWith("remote-jobs/")),false);
  assert.equal([...included].some(path=>path.startsWith("remote-mesh/")),false);
  assert.equal([...included].some(path=>path.startsWith("project-history/")),false);
  assert.equal([...included].some(path=>path.startsWith("federation/")),false);
  assert.equal(plan.manifest.gitHistoryIncluded,false);
  assert.equal(plan.manifest.creatorApprovalRecorded,false);
  assert.equal(plan.manifest.publicationPerformed,false);
  assert.match(plan.manifest.contentRootHash,/^[a-f0-9]{64}$/);
  assert.match(plan.manifest.manifestHash,/^[a-f0-9]{64}$/);
});

test("manifest content root is reproducible for the same selected bytes",async()=>{
  const root=await mkdtemp(join(tmpdir(),"arca-publication-"));
  try{
    await mkdir(join(root,"src"),{recursive:true});
    await writeFile(join(root,"README.md"),"hello\n");
    await writeFile(join(root,"src","a.mjs"),"export const a=1;\n");
    const policy=normalizePublicationPolicy({
      format:"arca-publication-boundary-v1",
      version:"1.0.0",
      defaultAction:"exclude",
      historyMode:"fresh-root-only",
      creatorApprovalRequired:true,
      publicRepositoryCreationAllowed:false,
      allow:["README.md","src/**"],
      deny:[]
    });
    const a=await createPublicationPlan({root,policy,sourceSha:"abc",generatedAt:"2026-09-20T00:00:00Z"});
    const b=await createPublicationPlan({root,policy,sourceSha:"abc",generatedAt:"2026-09-20T01:00:00Z"});
    assert.equal(a.manifest.contentRootHash,b.manifest.contentRootHash);
    assert.equal(a.manifest.manifestHash,b.manifest.manifestHash);
    assert.notEqual(a.manifest.generatedAt,b.manifest.generatedAt);
  }finally{await rm(root,{recursive:true,force:true})}
});

test("preview is a fresh tree with manifest and without private history/runtime",async()=>{
  const policy=await loadPublicationPolicy(policyPath);
  const out=resolve(repoRoot,".arca-publication-preview","test-run");
  try{
    const result=await writePublicationPreview({
      root:repoRoot,
      outDir:out,
      policy,
      sourceSha:"preview-test",
      generatedAt:"2026-09-20T00:00:00Z"
    });
    const manifest=JSON.parse(await readFile(resolve(out,"PUBLICATION_MANIFEST.json"),"utf8"));
    assert.equal(result.plan.ok,true);
    assert.equal(manifest.gitHistoryIncluded,false);
    assert.equal(manifest.repositoryCreated,false);
    await assert.rejects(()=>readFile(resolve(out,"remote-jobs","workers","github-actions.json")));
    await assert.rejects(()=>readFile(resolve(out,"project-history","STATE_AND_RECOVERY.md")));
  }finally{await rm(resolve(repoRoot,".arca-publication-preview"),{recursive:true,force:true})}
});
