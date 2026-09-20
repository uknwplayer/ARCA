export const ARCA_A2A_REFERENCE_CLASSIFICATION_FORMAT="arca-a2a-reference-classification-v1";

function bounded(value,label,max){
  const text=String(value??"").trim();
  if(!text)throw new TypeError(label+" required");
  if(text.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return text;
}
function isLoopback(hostname){
  const host=String(hostname).toLowerCase();
  return host==="localhost"||host==="127.0.0.1"||host==="::1"||host==="[::1]";
}

export function classifyA2aReference(value){
  const raw=bounded(value,"A2A reference",2048);
  const url=new URL(raw);
  if(url.protocol!=="https:")throw new Error("A2A reference requires HTTPS");
  if(isLoopback(url.hostname))throw new Error("A2A reference refuses loopback");
  if(url.username||url.password||url.search||url.hash)throw new Error("A2A reference cannot contain credentials, query or fragment");

  const host=url.hostname.toLowerCase();
  const path=url.pathname.replace(/\/+$/,"")||"/";
  let kind="generic-https-reference";
  let repository=null;
  let sourceOrigin=url.origin;

  if(path==="/.well-known/agent-card.json"){
    kind="direct-agent-card";
  }else if(host==="github.com"){
    const parts=path.split("/").filter(Boolean);
    if(parts.length===2){
      const [owner,repo]=parts;
      if(/^[A-Za-z0-9_.-]{1,100}$/.test(owner)&&/^[A-Za-z0-9_.-]{1,100}$/.test(repo)){
        kind="github-repository";
        repository=owner+"/"+repo;
      }
    }
  }

  return Object.freeze({
    format:ARCA_A2A_REFERENCE_CLASSIFICATION_FORMAT,
    version:1,
    input:raw,
    normalizedUrl:url.origin+path,
    sourceOrigin,
    kind,
    repository,
    automaticAgentCardInspectionAuthorized:kind==="direct-agent-card",
    trustState:"untrusted",
    admissionState:"not-admitted",
    candidateCreated:false,
    candidateExecuted:false,
    trustGranted:false,
    admissionGranted:false,
    dispatchAuthorized:false
  });
}
