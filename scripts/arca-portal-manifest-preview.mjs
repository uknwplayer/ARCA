import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {buildM4ControlledScopeV02} from "../src/investigation/m4-controlled-scope.mjs";

export const PORTAL_MANIFEST_PREVIEW_SCHEMA="arca.portal-manifest-preview.v0.1";

function required(value,code,max=512){
  if(typeof value!=="string"||value.length<1||value.length>max||value.trim()!==value||
     /[\u0000-\u001f\u007f]/.test(value))throw new Error(code);
  return value;
}
function revision(value){
  const out=required(value,"ARCA_PORTAL_MANIFEST_REVISION_INVALID",40);
  if(!/^[a-f0-9]{40}$/.test(out))throw new Error("ARCA_PORTAL_MANIFEST_REVISION_INVALID");
  return out;
}

export function buildPortalManifestPreview({env=process.env}={}){
  if(env.ARCA_PORTAL_MANIFEST_CONFIRMATION!=="PORTAL_MANIFEST_PREVIEW_ONLY")
    throw new Error("ARCA_PORTAL_MANIFEST_PREVIEW_CONFIRMATION_REQUIRED");
  const documentCode=required(env.ARCA_PORTAL_DOCUMENT_CODE,"ARCA_PORTAL_DOCUMENT_CODE_REQUIRED",80);
  const codeRevision=revision(env.GITHUB_SHA);
  const scope=buildM4ControlledScopeV02({
    source:"PORTAL",
    confirmation:"PORTAL_DOCUMENT_GET_ONLY",
    revision:codeRevision,
    documentCode,
    maxBytes:65536,
    timeoutMs:30000
  });
  return Object.freeze({
    schema:PORTAL_MANIFEST_PREVIEW_SCHEMA,
    status:"READY_FOR_REVIEW",
    revision:codeRevision,
    scopeHash:scope.scopeSha256,
    scope:scope.scope,
    budgets:scope.budgets,
    networkAuthorized:false,
    publicationAttempted:false,
    rawDocumentCodeExposed:false
  });
}

function writePreview(preview,outputPath){
  const resolved=path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved),{recursive:true});
  fs.writeFileSync(resolved,JSON.stringify(preview,null,2)+"\n",{encoding:"utf8",mode:0o600});
  return resolved;
}

async function main(){
  try{
    const preview=buildPortalManifestPreview();
    const output=writePreview(preview,process.env.ARCA_PORTAL_MANIFEST_OUTPUT??"artifacts/portal-manifest-preview.json");
    process.stdout.write(JSON.stringify({
      schema:preview.schema,
      status:preview.status,
      revision:preview.revision,
      scopeHash:preview.scopeHash,
      documentCodeSha256:preview.scope.documentCodeSha256,
      networkAuthorized:false,
      output:path.basename(output)
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))?error.message:"ARCA_PORTAL_MANIFEST_PREVIEW_FAILED";
    process.stderr.write(code+"\n");
    process.exitCode=1;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
