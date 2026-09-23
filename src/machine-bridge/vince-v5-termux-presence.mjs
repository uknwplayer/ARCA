import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify
} from "node:crypto";
import {
  createExecutionEndpointDescriptor,
  ExecutionEndpointRegistry
} from "./execution-endpoint.mjs";
import {
  ARCA_VINCE_V5_AVAILABILITY_FORMAT,
  selectVinceV5Route
} from "./vince-v5-endpoint-availability.mjs";
import {
  TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  TERMUX_V41_DEFAULT_CHANNEL_REPO,
  loadTermuxV41Identity,
  makeGhChannelClient
} from "./vince-v4-1-termux-worker.mjs";
import {sha256Canonical} from "./vince-v4-replit.mjs";

export const ARCA_VINCE_V5_TERMUX_PRESENCE_FORMAT="arca-vince-v5-termux-presence-v1";
export const ARCA_VINCE_V5_TERMUX_PRESENCE_STATES=Object.freeze(["READY","WITHDRAWN"]);

const NODE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const STATES=new Set(ARCA_VINCE_V5_TERMUX_PRESENCE_STATES);
const CAP=/^[A-Za-z0-9._:-]{1,128}$/;

function sha256Bytes(value){return createHash("sha256").update(value).digest("hex")}
function iso(value,label){
  const text=String(value??"").trim();
  const millis=Date.parse(text);
  if(!text||!Number.isFinite(millis))throw new Error(`VINCE_V5_TERMUX_${label}_INVALID`);
  return {text:new Date(millis).toISOString(),millis};
}
function ttlMs(value){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1_000||n>3_600_000)
    throw new Error("VINCE_V5_TERMUX_TTL_INVALID");
  return n;
}
function capabilities(values=["git-status"]){
  if(!Array.isArray(values))throw new Error("VINCE_V5_TERMUX_CAPABILITIES_INVALID");
  const out=[...new Set(values.map(v=>String(v??"").trim()).filter(Boolean))].sort();
  if(out.length===0||out.some(v=>!CAP.test(v)))throw new Error("VINCE_V5_TERMUX_CAPABILITY_INVALID");
  return Object.freeze(out);
}
function exactKeys(value,expected){
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const a=Object.keys(value).sort();
  const b=[...expected].sort();
  return a.length===b.length&&a.every((key,i)=>key===b[i]);
}
function publicKeyFromIdentity(identity){
  if(!identity||!NODE_ID.test(identity.nodeId)||identity.algorithm!=="Ed25519"||
     typeof identity.publicKeySpki!=="string"||!HASH.test(identity.keyFingerprint))
    throw new Error("VINCE_V5_TERMUX_IDENTITY_INVALID");
  const der=Buffer.from(identity.publicKeySpki,"base64");
  if(sha256Bytes(der)!==identity.keyFingerprint)
    throw new Error("VINCE_V5_TERMUX_IDENTITY_FINGERPRINT_MISMATCH");
  const key=createPublicKey({key:der,format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519")throw new Error("VINCE_V5_TERMUX_PUBLIC_KEY_INVALID");
  return key;
}
function assertPin(pin){
  if(!pin||pin.format!=="arca-vince-v4.1-worker-pin"||pin.version!==1||
     pin.workerKind!=="termux-android")
    throw new Error("VINCE_V5_TERMUX_PIN_INVALID");
  publicKeyFromIdentity(pin.identity);
  return pin.identity;
}
function baseFromPresence(presence){
  return {
    format:presence.format,
    version:presence.version,
    workerKind:presence.workerKind,
    nodeId:presence.nodeId,
    keyFingerprint:presence.keyFingerprint,
    publicKeySpki:presence.publicKeySpki,
    state:presence.state,
    observedAt:presence.observedAt,
    validUntil:presence.validUntil,
    capabilities:presence.capabilities,
    authority:presence.authority
  };
}
function observationFromPresence({presence,state,reason,executionReady,routeEligible}){
  return Object.freeze({
    format:ARCA_VINCE_V5_AVAILABILITY_FORMAT,
    version:1,
    endpointId:presence.nodeId,
    state,
    reason,
    source:"termux-signed-presence",
    observedAt:presence.observedAt,
    validUntil:presence.validUntil,
    surfaceReachable:true,
    wakeAcknowledged:false,
    executionReady:executionReady===true,
    routeEligible:routeEligible===true,
    evidence:Object.freeze({
      presenceSha256:presence.presenceSha256,
      workerKeyFingerprint:presence.keyFingerprint,
      presenceState:presence.state,
      cryptographicPresenceVerified:true
    }),
    authority:Object.freeze({
      trustGranted:false,
      codeMutation:false,
      canonicalWrite:false,
      executionAuthority:false
    })
  });
}

export function buildSignedTermuxV5Presence({
  identity,
  privateKey,
  state="READY",
  observedAt=new Date().toISOString(),
  ttl=300_000,
  providedCapabilities=["git-status"]
}={}){
  const publicKey=publicKeyFromIdentity(identity);
  const derived=createPublicKey(privateKey);
  const derivedDer=Buffer.from(derived.export({type:"spki",format:"der"}));
  if(derived.asymmetricKeyType!=="ed25519"||
     derivedDer.toString("base64")!==identity.publicKeySpki||
     sha256Bytes(derivedDer)!==identity.keyFingerprint)
    throw new Error("VINCE_V5_TERMUX_PRIVATE_KEY_IDENTITY_MISMATCH");
  if(!STATES.has(state))throw new Error("VINCE_V5_TERMUX_STATE_INVALID");
  const observed=iso(observedAt,"OBSERVED_AT");
  const duration=ttlMs(ttl);
  const base={
    format:ARCA_VINCE_V5_TERMUX_PRESENCE_FORMAT,
    version:1,
    workerKind:"termux-android",
    nodeId:identity.nodeId,
    keyFingerprint:identity.keyFingerprint,
    publicKeySpki:identity.publicKeySpki,
    state,
    observedAt:observed.text,
    validUntil:new Date(observed.millis+duration).toISOString(),
    capabilities:capabilities(providedCapabilities),
    authority:Object.freeze({
      trustGranted:false,
      codeMutation:false,
      canonicalWrite:false,
      executionAuthority:false
    })
  };
  const presenceSha256=sha256Canonical(base);
  const signature=cryptoSign(null,Buffer.from(presenceSha256,"hex"),privateKey).toString("base64url");
  return Object.freeze({...base,presenceSha256,signature});
}

export function verifyTermuxV5Presence({
  presence,
  pin,
  now=new Date().toISOString(),
  futureSkewMs=30_000
}={}){
  if(!exactKeys(presence,[
    "format","version","workerKind","nodeId","keyFingerprint","publicKeySpki","state",
    "observedAt","validUntil","capabilities","authority","presenceSha256","signature"
  ]))throw new Error("VINCE_V5_TERMUX_PRESENCE_SCHEMA_INVALID");
  if(presence.format!==ARCA_VINCE_V5_TERMUX_PRESENCE_FORMAT||presence.version!==1||
     presence.workerKind!=="termux-android"||!STATES.has(presence.state)||
     !NODE_ID.test(presence.nodeId)||!HASH.test(presence.presenceSha256)||
     typeof presence.signature!=="string")
    throw new Error("VINCE_V5_TERMUX_PRESENCE_INVALID");

  const pinned=assertPin(pin);
  if(
    presence.nodeId!==pinned.nodeId||
    presence.keyFingerprint!==pinned.keyFingerprint||
    presence.publicKeySpki!==pinned.publicKeySpki
  )throw new Error("VINCE_V5_TERMUX_PIN_MISMATCH");

  capabilities(presence.capabilities);
  if(!presence.authority||Object.values(presence.authority).some(v=>v!==false))
    throw new Error("VINCE_V5_TERMUX_AUTHORITY_INVALID");

  const expectedHash=sha256Canonical(baseFromPresence(presence));
  if(expectedHash!==presence.presenceSha256)
    throw new Error("VINCE_V5_TERMUX_PRESENCE_HASH_MISMATCH");
  const publicKey=publicKeyFromIdentity(pinned);
  const validSignature=cryptoVerify(
    null,
    Buffer.from(expectedHash,"hex"),
    publicKey,
    Buffer.from(presence.signature,"base64url")
  );
  if(!validSignature)throw new Error("VINCE_V5_TERMUX_SIGNATURE_INVALID");

  const clock=iso(now,"NOW");
  const observed=iso(presence.observedAt,"OBSERVED_AT");
  const valid=iso(presence.validUntil,"VALID_UNTIL");
  if(valid.millis<observed.millis)throw new Error("VINCE_V5_TERMUX_VALIDITY_INVALID");
  const skew=Number(futureSkewMs);
  if(!Number.isSafeInteger(skew)||skew<0||skew>300_000)
    throw new Error("VINCE_V5_TERMUX_FUTURE_SKEW_INVALID");

  if(observed.millis>clock.millis+skew)
    return observationFromPresence({presence,state:"INCONCLUSIVE",reason:"SIGNED_PRESENCE_IN_FUTURE",executionReady:false,routeEligible:false});
  if(valid.millis<clock.millis)
    return observationFromPresence({presence,state:"INCONCLUSIVE",reason:"SIGNED_PRESENCE_STALE",executionReady:false,routeEligible:false});
  if(presence.state==="WITHDRAWN")
    return observationFromPresence({presence,state:"INCONCLUSIVE",reason:"SIGNED_PRESENCE_WITHDRAWN",executionReady:false,routeEligible:false});
  return observationFromPresence({presence,state:"AVAILABLE",reason:"CRYPTOGRAPHIC_READY_LEASE",executionReady:true,routeEligible:true});
}

export async function publishTermuxV5Presence({
  identityDirectory,
  state="READY",
  ttl=300_000,
  channelRepository=TERMUX_V41_DEFAULT_CHANNEL_REPO,
  channelBranch=TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  channelClient=makeGhChannelClient(),
  clock=()=>new Date()
}={}){
  const loaded=await loadTermuxV41Identity({directory:identityDirectory});
  const presence=buildSignedTermuxV5Presence({
    identity:loaded.identity,
    privateKey:loaded.privateKey,
    state,
    observedAt:clock().toISOString(),
    ttl,
    providedCapabilities:["git-status"]
  });
  const stamp=Date.parse(presence.observedAt);
  const path=`remote-jobs/v5/presence/${presence.nodeId}/${stamp}-${presence.presenceSha256.slice(0,16)}.json`;
  await channelClient.createJson({
    repository:channelRepository,
    branch:channelBranch,
    path,
    message:`vince v5 termux presence: ${presence.nodeId} ${presence.state}`,
    value:presence
  });
  return Object.freeze({
    status:"SIGNED_PRESENCE_PUBLISHED",
    channelRepository,
    channelBranch,
    path,
    presence
  });
}

export function routeTermuxV5Candidates({
  pins=[],
  presences=[],
  now=new Date().toISOString()
}={}){
  if(!Array.isArray(pins)||!Array.isArray(presences)||pins.length===0||pins.length!==presences.length)
    throw new Error("VINCE_V5_TERMUX_CANDIDATES_INVALID");
  const registry=new ExecutionEndpointRegistry();
  const observations=[];
  const seen=new Set();
  for(let i=0;i<pins.length;i++){
    const identity=assertPin(pins[i]);
    if(seen.has(identity.nodeId))throw new Error("VINCE_V5_TERMUX_DUPLICATE_NODE");
    seen.add(identity.nodeId);
    registry.register(createExecutionEndpointDescriptor({
      endpointId:identity.nodeId,
      participantKind:"worker",
      capabilities:["git-status"],
      operations:{},
      transport:{
        kind:"github-signed-presence",
        protocolVersion:"5",
        workerKind:"termux-android"
      }
    }),{});
    observations.push(verifyTermuxV5Presence({presence:presences[i],pin:pins[i],now}));
  }
  const route=selectVinceV5Route({
    registry,
    capability:"git-status",
    observations,
    now
  });
  return Object.freeze({
    format:"arca-vince-v5-termux-route-proof-v1",
    version:1,
    observedAt:new Date(now).toISOString(),
    observations:Object.freeze(observations),
    route,
    safety:Object.freeze({
      dispatchPerformed:false,
      workUsed:false,
      replitUsed:false,
      githubActionsUsedAsExecutor:false,
      edgeStewardActivated:false,
      authorityExpanded:false
    })
  });
}
