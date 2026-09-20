import {createHash} from "node:crypto";
import {chmod,copyFile,lstat,mkdir,readFile,readdir,rm,writeFile} from "node:fs/promises";
import {dirname,relative,resolve,sep} from "node:path";
import {scanStaticPublicDependencyClosure} from "./publication-self-containment.mjs";

export const ARCA_PUBLICATION_BOUNDARY_FORMAT="arca-publication-boundary-v1";
export const ARCA_PUBLICATION_MANIFEST_FORMAT="arca-publication-manifest-v1";

const HARD_DENY_PATTERNS=Object.freeze([
  ".git/**",
  ".arca/**",
  ".arca-demo/**",
  ".arca-status/**",
  ".arca-publication-preview/**",
  ".d2-runtime/**",
  "node_modules/**",
  "coverage/**",
  "dist/**",
  "build/**",
  "output/**",
  "tmp/**",
  "release/**",
  "remote-jobs/**",
  "remote-mesh/**",
  "project-history/**",
  "federation/**"
]);
const SAFE_PUBLIC_WORKFLOW=".github/workflows/arca-ci.yml";
const SECRET_PATH_PATTERNS=Object.freeze([
  ".env","**/.env","**/.env.*","**/*.pem","**/*.key","**/*.p12","**/*.pfx",
  "**/id_rsa","**/id_ed25519","**/credentials.json","**/secrets.json"
]);
const SECRET_CONTENT_RULES=Object.freeze([
  ["github-token",/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["github-fine-grained-token",/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g],
  ["openai-style-secret",/\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["google-api-key",/\bAIza[0-9A-Za-z_-]{25,}\b/g],
  ["aws-access-key",/\bAKIA[0-9A-Z]{16}\b/g],
  ["slack-token",/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["private-key-block",/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g]
]);
const WALK_SKIP_ROOTS=new Set([
  ".git","node_modules","coverage","dist","build","output","tmp","release",
  ".arca",".arca-demo",".arca-status",".arca-publication-preview",".d2-runtime"
]);

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(plain(value)){
    const out={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonical(value[key]);
    return out;
  }
  return value;
}
function sha256Bytes(value){return createHash("sha256").update(value).digest("hex")}
function sha256Json(value){return sha256Bytes(JSON.stringify(canonical(value)))}
function normalizePath(value){
  if(typeof value!=="string"||!value.trim())throw new TypeError("publication path required");
  const normalized=value.replaceAll("\\","/").replace(/^\.\//,"").replace(/^\/+|\/+$/g,"");
  if(!normalized||normalized.split("/").some(part=>part===".."||part===""))throw new Error("ARCA_PUBLICATION_PATH_INVALID");
  return normalized;
}
function globRegex(pattern){
  const p=normalizePath(pattern);
  let out="^";
  for(let i=0;i<p.length;i++){
    const ch=p[i];
    if(ch==="*"){
      if(p[i+1]==="*"){
        if(p[i+2]==="/"){out+="(?:.*/)?";i+=2;}
        else{out+=".*";i+=1;}
      }else out+="[^/]*";
      continue;
    }
    if(ch==="?"){out+="[^/]";continue}
    out+=/[\\^$+?.()|{}\[\]]/.test(ch)?"\\"+ch:ch;
  }
  return new RegExp(out+"$");
}
function matcher(patterns){
  const compiled=patterns.map(pattern=>[pattern,globRegex(pattern)]);
  return path=>compiled.find(([,regex])=>regex.test(path))?.[0]??null;
}
function normalizeStringArray(value,field){
  if(!Array.isArray(value))throw new TypeError(field+" must be an array");
  const out=[...new Set(value.map(String).map(v=>v.trim()).filter(Boolean))];
  for(const item of out)normalizePath(item);
  return out;
}

export function normalizePublicationPolicy(raw){
  if(!plain(raw)||raw.format!==ARCA_PUBLICATION_BOUNDARY_FORMAT)throw new Error("ARCA_PUBLICATION_POLICY_FORMAT_INVALID");
  if(raw.version!=="1.0.0")throw new Error("ARCA_PUBLICATION_POLICY_VERSION_UNSUPPORTED");
  if(raw.defaultAction!=="exclude")throw new Error("ARCA_PUBLICATION_POLICY_MUST_FAIL_CLOSED");
  if(raw.historyMode!=="fresh-root-only")throw new Error("ARCA_PUBLICATION_HISTORY_MODE_UNSAFE");
  if(raw.creatorApprovalRequired!==true)throw new Error("ARCA_PUBLICATION_CREATOR_APPROVAL_REQUIRED");
  if(raw.publicRepositoryCreationAllowed!==false)throw new Error("ARCA_PUBLICATION_AUTOCREATE_FORBIDDEN");
  const allow=normalizeStringArray(raw.allow,"allow");
  const deny=normalizeStringArray(raw.deny,"deny");
  const prohibitedTokenFingerprints=normalizeStringArray(raw.prohibitedTokenFingerprints??[],"prohibitedTokenFingerprints");
  for(const fingerprint of prohibitedTokenFingerprints)if(!/^[a-f0-9]{64}$/.test(fingerprint))throw new Error("ARCA_PUBLICATION_FINGERPRINT_INVALID");
  const fingerprintAllowlist={};
  if(raw.fingerprintAllowlist!==undefined&&!plain(raw.fingerprintAllowlist))throw new TypeError("fingerprintAllowlist must be an object");
  for(const [path,values] of Object.entries(raw.fingerprintAllowlist??{})){
    const normalizedPath=normalizePath(path);
    const normalizedValues=normalizeStringArray(values,"fingerprintAllowlist."+normalizedPath);
    for(const fingerprint of normalizedValues)if(!/^[a-f0-9]{64}$/.test(fingerprint))throw new Error("ARCA_PUBLICATION_FINGERPRINT_INVALID");
    fingerprintAllowlist[normalizedPath]=normalizedValues;
  }
  const normalized=Object.freeze({
    format:raw.format,
    version:raw.version,
    defaultAction:raw.defaultAction,
    historyMode:raw.historyMode,
    creatorApprovalRequired:true,
    publicRepositoryCreationAllowed:false,
    manifestName:typeof raw.manifestName==="string"&&raw.manifestName.trim()?normalizePath(raw.manifestName):"PUBLICATION_MANIFEST.json",
    allow:Object.freeze(allow),
    deny:Object.freeze(deny),
    prohibitedTokenFingerprints:Object.freeze(prohibitedTokenFingerprints),
    fingerprintAllowlist:Object.freeze(fingerprintAllowlist)
  });
  return normalized;
}

export async function loadPublicationPolicy(path){
  return normalizePublicationPolicy(JSON.parse(await readFile(path,"utf8")));
}

export function classifyPublicationPath(path,policyInput){
  const pathName=normalizePath(path);
  const policy=normalizePublicationPolicy(policyInput);
  const hardDeny=matcher(HARD_DENY_PATTERNS)(pathName);
  if(hardDeny)return Object.freeze({path:pathName,action:"exclude",reason:"hard-deny",rule:hardDeny});
  if(pathName.startsWith(".github/workflows/")&&pathName!==SAFE_PUBLIC_WORKFLOW){
    return Object.freeze({path:pathName,action:"exclude",reason:"operational-workflow",rule:pathName});
  }
  const secretPath=matcher(SECRET_PATH_PATTERNS)(pathName);
  if(secretPath)return Object.freeze({path:pathName,action:"exclude",reason:"secret-path",rule:secretPath});
  const denied=matcher(policy.deny)(pathName);
  if(denied)return Object.freeze({path:pathName,action:"exclude",reason:"policy-deny",rule:denied});
  const allowed=matcher(policy.allow)(pathName);
  if(allowed)return Object.freeze({path:pathName,action:"include",reason:"policy-allow",rule:allowed});
  return Object.freeze({path:pathName,action:"exclude",reason:"default-deny",rule:null});
}

export function scanPublicationContent(path,buffer,policyInput){
  const pathName=normalizePath(path);
  const policy=normalizePublicationPolicy(policyInput);
  const bytes=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer);
  const hits=[];
  if(bytes.includes(0))return Object.freeze(hits);
  const text=bytes.toString("utf8");
  for(const [rule,regex] of SECRET_CONTENT_RULES){
    regex.lastIndex=0;
    if(regex.test(text))hits.push(Object.freeze({path:pathName,kind:"secret-content",rule}));
  }
  const blocked=new Set(policy.prohibitedTokenFingerprints);
  const allowed=new Set(policy.fingerprintAllowlist[pathName]??[]);
  if(blocked.size){
    const normalized=(pathName+"\n"+text).toLocaleLowerCase("pt-BR");
    const tokens=normalized.match(/[\p{L}\p{N}][\p{L}\p{N}.-]*/gu)??[];
    const candidates=[...tokens,...tokens.slice(0,-1).map((token,index)=>token+" "+tokens[index+1])];
    for(const candidate of candidates){
      const fingerprint=sha256Bytes(candidate);
      if(blocked.has(fingerprint)&&!allowed.has(fingerprint)){
        hits.push(Object.freeze({path:pathName,kind:"private-fingerprint",rule:fingerprint}));
        break;
      }
    }
  }
  return Object.freeze(hits);
}

async function walkRepository(root){
  const files=[];
  async function walk(dir,relativeDir=""){
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const rel=relativeDir?relativeDir+"/"+entry.name:entry.name;
      const top=rel.split("/")[0];
      if(entry.isDirectory()&&WALK_SKIP_ROOTS.has(top))continue;
      const abs=resolve(dir,entry.name);
      if(entry.isDirectory()){await walk(abs,rel);continue}
      if(entry.isFile()){files.push({path:normalizePath(rel),absolutePath:abs});continue}
      if(entry.isSymbolicLink())files.push({path:normalizePath(rel),absolutePath:abs,symlink:true});
    }
  }
  await walk(resolve(root));
  return files.sort((a,b)=>a.path.localeCompare(b.path));
}

export async function createPublicationPlan({root,policy:policyInput,sourceSha="working-tree",generatedAt=new Date().toISOString()}={}){
  if(typeof root!=="string"||!root)throw new TypeError("root required");
  const policy=normalizePublicationPolicy(policyInput);
  const files=await walkRepository(root);
  const included=[];
  const excluded=[];
  const violations=[];
  for(const file of files){
    const classification=classifyPublicationPath(file.path,policy);
    if(classification.action!=="include"){
      excluded.push(classification);
      continue;
    }
    if(file.symlink){
      violations.push({path:file.path,kind:"symlink-not-allowed",rule:"symlink"});
      continue;
    }
    const bytes=await readFile(file.absolutePath);
    const contentHits=scanPublicationContent(file.path,bytes,policy);
    if(contentHits.length){
      violations.push(...contentHits);
      continue;
    }
    included.push(Object.freeze({path:file.path,bytes:bytes.byteLength,sha256:sha256Bytes(bytes),absolutePath:file.absolutePath}));
  }
  violations.push(...await scanStaticPublicDependencyClosure(included));
  const publicFiles=included.map(({path,bytes,sha256})=>({path,bytes,sha256}));
  const policyHash=sha256Json(policy);
  const contentRootHash=sha256Json(publicFiles);
  const stableManifest={
    format:ARCA_PUBLICATION_MANIFEST_FORMAT,
    boundaryVersion:policy.version,
    sourceSha:String(sourceSha||"working-tree"),
    historyMode:"fresh-root-only",
    gitHistoryIncluded:false,
    creatorApprovalRequired:true,
    creatorApprovalRecorded:false,
    publicationPerformed:false,
    repositoryCreated:false,
    policyHash,
    contentRootHash,
    fileCount:publicFiles.length,
    totalBytes:publicFiles.reduce((sum,file)=>sum+file.bytes,0),
    files:publicFiles
  };
  const manifest=Object.freeze({...stableManifest,generatedAt:new Date(generatedAt).toISOString(),manifestHash:sha256Json(stableManifest)});
  return Object.freeze({
    ok:violations.length===0,
    policy,
    manifest,
    included:Object.freeze(included),
    excluded:Object.freeze(excluded),
    violations:Object.freeze(violations)
  });
}

export async function writePublicationPreview({root,outDir,policy,sourceSha="working-tree",generatedAt}={}){
  if(typeof outDir!=="string"||!outDir)throw new TypeError("outDir required");
  const sourceRoot=resolve(root);
  const target=resolve(outDir);
  const rel=relative(sourceRoot,target);
  if(!rel||(!rel.startsWith(".."+sep)&&rel!=="..")){
    const normalized=rel.replaceAll("\\","/");
    if(normalized!==".arca-publication-preview"&&!normalized.startsWith(".arca-publication-preview/")){
      throw new Error("ARCA_PUBLICATION_PREVIEW_OUTPUT_MUST_BE_ISOLATED");
    }
  }
  const plan=await createPublicationPlan({root:sourceRoot,policy,sourceSha,generatedAt});
  if(!plan.ok){
    const error=new Error("ARCA_PUBLICATION_BOUNDARY_VIOLATION");
    error.code="ARCA_PUBLICATION_BOUNDARY_VIOLATION";
    error.violations=plan.violations;
    throw error;
  }
  await rm(target,{recursive:true,force:true});
  await mkdir(target,{recursive:true});
  for(const file of plan.included){
    const destination=resolve(target,file.path);
    await mkdir(dirname(destination),{recursive:true});
    await copyFile(file.absolutePath,destination);
    const sourceStat=await lstat(file.absolutePath);
    await chmod(destination,sourceStat.mode&0o777);
  }
  await writeFile(resolve(target,plan.policy.manifestName),JSON.stringify(plan.manifest,null,2)+"\n","utf8");
  const reasonCounts={};
  for(const item of plan.excluded)reasonCounts[item.reason]=(reasonCounts[item.reason]??0)+1;
  const report={
    format:"arca-publication-boundary-report-v1",
    ok:true,
    generatedAt:plan.manifest.generatedAt,
    sourceSha:plan.manifest.sourceSha,
    includedFiles:plan.manifest.fileCount,
    excludedFiles:plan.excluded.length,
    exclusionReasons:reasonCounts,
    violations:[],
    creatorApprovalRequired:true,
    creatorApprovalRecorded:false,
    publicationPerformed:false,
    repositoryCreated:false
  };
  await writeFile(resolve(target,"PUBLICATION_BOUNDARY_REPORT.json"),JSON.stringify(report,null,2)+"\n","utf8");
  return Object.freeze({plan,target,report:Object.freeze(report)});
}
