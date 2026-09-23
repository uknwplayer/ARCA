import path from "node:path";
import {pathToFileURL} from "node:url";
import {buildM4ControlledScopeV02} from "../src/investigation/m4-controlled-scope.mjs";

function required(value,code,max=256){
  if(typeof value!=="string"||value.length<1||value.length>max||
     value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value))
    throw new Error(code);
  return value;
}

export function derivePortalRelatedDocumentsScopeBinding({env=process.env}={}){
  const revision=required(env.GITHUB_SHA,"ARCA_PORTAL_SCOPE_REVISION_REQUIRED",40);
  if(!/^[a-f0-9]{40}$/.test(revision))
    throw new Error("ARCA_PORTAL_SCOPE_REVISION_INVALID");
  const documentCode=required(env.ARCA_PORTAL_DOCUMENT_CODE,"ARCA_PORTAL_DOCUMENT_CODE_REQUIRED",80);
  const scope=buildM4ControlledScopeV02({
    source:"PORTAL",
    confirmation:"PORTAL_DOCUMENT_GET_ONLY",
    revision,
    documentCode,
    maxBytes:65536,
    timeoutMs:30000
  });
  return Object.freeze({
    scopeSha256:scope.scopeSha256,
    documentCodeSha256:scope.scope.documentCodeSha256,
    revision
  });
}

async function main(){
  try{
    const out=derivePortalRelatedDocumentsScopeBinding();
    process.stdout.write(`ARCA_PORTAL_SCOPE_SHA256=${out.scopeSha256}\n`);
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))
      ?error.message:"ARCA_PORTAL_SCOPE_BINDING_FAILED";
    process.stderr.write(code+"\n");
    process.exitCode=1;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
