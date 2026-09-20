import {
  MESH_NODE_ADVERTISEMENT_DOMAIN,
  verifySignedMeshNodeAdvertisement
} from "./mesh-identity.mjs";

export const ARCA_GITHUB_MESH_FEDERATED_PEER_FORMAT="arca-github-mesh-federated-peer-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const REPOSITORY=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);
  return value;
}
function normalizeCapabilities(values=[]){
  if(!Array.isArray(values))throw new TypeError("capabilities must be an array");
  const out=[...new Set(values.map(String).map(value=>value.trim()).filter(Boolean))].sort();
  if(out.some(value=>value.length>160))throw new Error("capability too long");
  return out;
}
function expectedTransport(mailbox){
  if(!REPOSITORY.test(mailbox?.repository||""))throw new Error("federation mailbox repository required");
  if(typeof mailbox?.ref!=="string"||!mailbox.ref)throw new Error("federation mailbox ref required");
  if(typeof mailbox?.root!=="string"||!mailbox.root)throw new Error("federation mailbox root required");
  return Object.freeze({
    kind:"github-mailbox",
    repository:mailbox.repository,
    ref:mailbox.ref,
    root:mailbox.root
  });
}
function assertTransportBinding(actual,expected){
  if(!actual||typeof actual!=="object"||Array.isArray(actual))throw new Error("federated peer transport descriptor required");
  for(const key of ["kind","repository","ref","root"]){
    if(actual[key]!==expected[key])throw new Error("federated peer transport binding mismatch: "+key);
  }
  return true;
}
function identityBinding(statement){
  return Object.freeze({
    nodeId:statement.signer.nodeId,
    identityId:statement.signer.identityId,
    keyFingerprint:statement.signer.keyFingerprint,
    descriptorHash:statement.signer.descriptorHash
  });
}

export class GitHubMeshFederationPeerResolver{
  constructor({
    mailbox,
    trustStore=mailbox?.trustStore,
    now=()=>new Date(),
    maxAgeMs=5*60*1000,
    clockSkewMs=60_000
  }={}){
    if(!mailbox||typeof mailbox.listNodes!=="function"||typeof mailbox.remotePeer!=="function")throw new TypeError("federation GitHub Mesh mailbox required");
    if(mailbox.identityPolicy!=="require-trusted")throw new Error("federation requires require-trusted Mesh mailbox policy");
    if(!trustStore||typeof trustStore.verify!=="function")throw new TypeError("federation trustStore.verify() required");
    if(typeof now!=="function")throw new TypeError("federation clock required");
    if(!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>24*60*60*1000)throw new Error("invalid federation maxAgeMs");
    if(!Number.isSafeInteger(clockSkewMs)||clockSkewMs<0||clockSkewMs>5*60*1000)throw new Error("invalid federation clockSkewMs");
    this.mailbox=mailbox;
    this.trustStore=trustStore;
    this.now=now;
    this.maxAgeMs=maxAgeMs;
    this.clockSkewMs=clockSkewMs;
    this.transport=expectedTransport(mailbox);
  }

  async resolve(nodeId,{
    expectedKeyFingerprint=null,
    waitTimeoutMs=180000,
    pollIntervalMs=1000,
    sleepImpl,
    waitNow
  }={}){
    safeId(nodeId,"federated peer node id");
    const now=new Date(this.now());
    const candidates=await this.mailbox.listNodes({
      now,
      maxAgeMs:this.maxAgeMs,
      includeStale:false,
      clockSkewMs:this.clockSkewMs
    });
    const candidate=candidates.find(value=>value?.node?.nodeId===nodeId);
    if(!candidate){
      if(typeof this.mailbox.inspectNode==="function"){
        const inspected=await this.mailbox.inspectNode(nodeId,{
          now,
          maxAgeMs:this.maxAgeMs,
          clockSkewMs:this.clockSkewMs
        });
        if(inspected){
          if(!inspected.valid)throw new Error("federated peer advertisement rejected: "+nodeId);
          if(!inspected.signed)throw new Error("federated peer signed advertisement required: "+nodeId);
          if(!inspected.identityTrusted)throw new Error("untrusted federated peer identity: "+nodeId);
          if(inspected.stale)throw new Error("trusted federated peer unavailable or stale: "+nodeId);
        }
      }
      throw new Error("trusted federated peer not found: "+nodeId);
    }
    if(!candidate.signed||!candidate.identityTrusted||!candidate.statement)throw new Error("federated peer must have trusted signed advertisement");

    verifySignedMeshNodeAdvertisement(candidate.statement,{
      now,
      clockSkewMs:this.clockSkewMs,
      expectedNodeId:nodeId
    });
    this.trustStore.verify(candidate.statement,{
      expectedDomain:MESH_NODE_ADVERTISEMENT_DOMAIN,
      expectedNodeId:nodeId,
      now,
      clockSkewMs:this.clockSkewMs
    });
    assertTransportBinding(candidate.node.transport,this.transport);

    if(expectedKeyFingerprint!==null){
      const expected=String(expectedKeyFingerprint);
      if(candidate.statement.signer.keyFingerprint!==expected)throw new Error("federated peer key fingerprint mismatch");
    }

    const capabilities=normalizeCapabilities(candidate.node.capabilities||[]);
    const reachableCapabilities=normalizeCapabilities(candidate.node.reachableCapabilities||capabilities);
    const remoteOptions={
      capabilities,
      reachableCapabilities,
      waitTimeoutMs,
      pollIntervalMs
    };
    if(sleepImpl!==undefined)remoteOptions.sleepImpl=sleepImpl;
    if(waitNow!==undefined)remoteOptions.now=waitNow;
    const remote=this.mailbox.remotePeer(nodeId,remoteOptions);
    const federation=Object.freeze({
      format:ARCA_GITHUB_MESH_FEDERATED_PEER_FORMAT,
      version:1,
      transport:this.transport,
      identity:identityBinding(candidate.statement),
      advertisementHash:candidate.statement.statementHash,
      heartbeatAt:candidate.node.heartbeatAt
    });

    return Object.freeze({
      nodeId,
      capabilities,
      reachableCapabilities,
      federation,
      forward:envelope=>remote.forward(envelope)
    });
  }
}

export function verifyGitHubFederatedPeerBinding(peer,{repository,ref="arca-runtime",root="remote-mesh",nodeId,keyFingerprint}={}){
  if(!peer||peer.federation?.format!==ARCA_GITHUB_MESH_FEDERATED_PEER_FORMAT||peer.federation.version!==1)throw new Error("invalid federated peer binding");
  if(nodeId!==undefined&&peer.nodeId!==nodeId)throw new Error("federated peer node binding mismatch");
  assertTransportBinding(peer.federation.transport,{kind:"github-mailbox",repository,ref,root});
  if(keyFingerprint!==undefined&&peer.federation.identity?.keyFingerprint!==keyFingerprint)throw new Error("federated peer identity binding mismatch");
  return true;
}
