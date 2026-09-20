import {GitHubMeshMailboxTransport} from "./github-mesh-mailbox.mjs";
import {MachineBridgeMeshRelay} from "./mesh.mjs";
import {
  federationPeerBindingHash,
  federationResolutionFailureCategory
} from "./federation-peer-health.mjs";
import {FederationPeerSelector} from "./federation-peer-selector.mjs";

export const ARCA_FEDERATION_RUNTIME_FORMAT="arca-federation-runtime-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const CREDENTIAL_REF=/^vault:\/\/[A-Za-z0-9._/-]{1,180}$/;
const BROKER_TOKEN_SENTINEL="arca-credential-broker-managed";

function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);
  return value;
}
function credentialRef(value){
  const ref=String(value??"").trim();
  if(!CREDENTIAL_REF.test(ref))throw new Error("federation runtime requires vault:// credentialRef");
  return ref;
}
function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function normalizePeerConfigs(values){
  if(!Array.isArray(values)||!values.length)throw new Error("federation runtime explicit peerConfigs required");
  const seen=new Set();
  return Object.freeze(values.map(value=>{
    if(!plain(value))throw new TypeError("invalid federation runtime peer config");
    const peerId=safeId(value.peerId,"federation runtime peerId");
    if(seen.has(peerId))throw new Error("duplicate federation runtime peerId: "+peerId);
    seen.add(peerId);
    return Object.freeze({peerId,credentialRef:credentialRef(value.credentialRef)});
  }));
}
function normalizeTransport(record){
  const transport=record?.transport;
  if(!plain(transport)||transport.kind!=="github-mailbox")throw new Error("federation runtime supports github-mailbox peers only");
  for(const field of ["repository","ref","root"])if(typeof transport[field]!=="string"||!transport[field])throw new Error("federation runtime peer transport incomplete");
  return Object.freeze({
    kind:"github-mailbox",
    repository:transport.repository,
    ref:transport.ref,
    root:transport.root
  });
}
function validateMailbox(mailbox,transport){
  if(!mailbox||typeof mailbox.listNodes!=="function"||typeof mailbox.remotePeer!=="function")throw new TypeError("federation runtime mailbox contract required");
  if(mailbox.identityPolicy!=="require-trusted")throw new Error("federation runtime mailbox must require trusted identities");
  if(mailbox.repository!==transport.repository||mailbox.ref!==transport.ref||mailbox.root!==transport.root)throw new Error("federation runtime mailbox transport mismatch");
  return mailbox;
}
function normalizeHealthStore(healthStore){
  for(const method of ["status","assertAttemptAllowed","recordFailure","wrapPeer"]){
    if(typeof healthStore?.[method]!=="function")throw new TypeError("federation runtime healthStore."+method+"() required");
  }
  return healthStore;
}
function normalizeTrustStore(trustStore){
  if(!trustStore||typeof trustStore.verify!=="function")throw new TypeError("federation runtime trustStore.verify() required");
  return trustStore;
}
function operationalFailure(error){
  if(error?.code==="ARCA_FEDERATION_PEER_COOLDOWN"){
    return Object.freeze({category:"cooldown",retryAt:error.retryAt??null});
  }
  const category=federationResolutionFailureCategory(error);
  return category?Object.freeze({category,retryAt:null}):null;
}
function frozenUnavailable({peerId,nodeId,category,retryAt=null}){
  return Object.freeze({peerId,nodeId,category,retryAt});
}
function assertCatalogRecordPinned(current,expected){
  if(!current||current.peerId!==expected.peerId||current.revision!==expected.revision||current.recordHash!==expected.recordHash){
    throw new Error("federation runtime catalog changed during assembly: "+expected.peerId);
  }
  return true;
}
function publicResolved(record){
  const transport=normalizeTransport(record);
  return Object.freeze({
    peerId:record.peerId,
    nodeId:record.nodeId,
    repository:transport.repository,
    ref:transport.ref,
    root:transport.root,
    keyFingerprint:record.identity.keyFingerprint,
    catalogRevision:record.revision,
    catalogRecordHash:record.recordHash
  });
}

export function createBrokeredGitHubMeshMailboxFactory({
  credentialBroker,
  apiBase="https://api.github.com"
}={}){
  if(!credentialBroker||typeof credentialBroker.authorizedFetch!=="function")throw new TypeError("federation runtime credentialBroker.authorizedFetch() required");
  if(typeof apiBase!=="string"||!apiBase.trim())throw new TypeError("federation runtime apiBase required");

  return async({credentialRef:ref,transport,trustStore}={})=>{
    const normalizedRef=credentialRef(ref);
    if(!plain(transport)||transport.kind!=="github-mailbox")throw new Error("brokered federation mailbox requires github-mailbox transport");
    const fetchImpl=(url,init={})=>credentialBroker.authorizedFetch({
      auth:{mode:"bearer",credentialRef:normalizedRef},
      url,
      init
    });
    return new GitHubMeshMailboxTransport({
      repository:transport.repository,
      ref:transport.ref,
      root:transport.root,
      token:BROKER_TOKEN_SENTINEL,
      apiBase,
      fetchImpl,
      identityPolicy:"require-trusted",
      trustStore
    });
  };
}

export async function assembleFederationRuntime({
  relayNodeId,
  catalog,
  healthStore,
  trustStore,
  peerConfigs,
  mailboxFactory,
  now=()=>new Date(),
  receiptSigner=null,
  requireSignedReceipts=true,
  requestOwnership=null,
  resolverOptions={},
  peerOptions={}
}={}){
  const nodeId=safeId(relayNodeId,"federation runtime relayNodeId");
  if(!catalog||typeof catalog.get!=="function"||typeof catalog.resolve!=="function")throw new TypeError("federation runtime catalog get()/resolve() required");
  normalizeHealthStore(healthStore);
  normalizeTrustStore(trustStore);
  if(typeof mailboxFactory!=="function")throw new TypeError("federation runtime mailboxFactory required");
  if(typeof now!=="function")throw new TypeError("federation runtime clock required");
  if(requireSignedReceipts!==true&&requireSignedReceipts!==false)throw new TypeError("federation runtime requireSignedReceipts must be boolean");
  if(requireSignedReceipts){
    if(!receiptSigner?.identity||receiptSigner.identity.nodeId!==nodeId)throw new Error("strict federation runtime requires relay receipt signer bound to relayNodeId");
  }

  const configs=normalizePeerConfigs(peerConfigs);
  const records=new Map();
  for(const config of configs){
    const record=await catalog.get(config.peerId);
    if(!record)throw new Error("federation runtime peer not found in catalog: "+config.peerId);
    if(record.status!=="active")throw new Error("federation runtime peer disabled: "+config.peerId);
    normalizeTransport(record);
    if(!Number.isSafeInteger(record.revision)||record.revision<1||typeof record.recordHash!=="string"||!HASH.test(record.recordHash))throw new Error("federation runtime requires sealed catalog record: "+config.peerId);
    records.set(config.peerId,record);
  }

  const selector=new FederationPeerSelector({
    healthStore,
    records:[...records.values()],
    now
  });

  const resolvedPeers=[];
  const resolvedPublic=[];
  const unavailable=[];

  for(const config of configs){
    const record=records.get(config.peerId);
    assertCatalogRecordPinned(await catalog.get(config.peerId),record);
    const bindingHash=federationPeerBindingHash(record);
    const at=new Date(now());
    if(!Number.isFinite(at.getTime()))throw new Error("invalid federation runtime time");
    const health=await healthStore.status(config.peerId,{bindingHash,now:at});
    if(!health.canAttempt||health.state==="cooldown"){
      unavailable.push(frozenUnavailable({
        peerId:config.peerId,
        nodeId:record.nodeId,
        category:"cooldown",
        retryAt:health.retryAt??null
      }));
      continue;
    }

    const transport=normalizeTransport(record);
    const mailbox=validateMailbox(await mailboxFactory(Object.freeze({
      peerId:config.peerId,
      credentialRef:config.credentialRef,
      transport,
      trustStore
    })),transport);

    try{
      const peer=await catalog.resolve(config.peerId,{
        mailbox,
        trustStore,
        healthStore,
        healthNow:now,
        resolverOptions:{...resolverOptions,now},
        peerOptions
      });
      assertCatalogRecordPinned(await catalog.get(config.peerId),record);
      resolvedPeers.push(peer);
      resolvedPublic.push(publicResolved(record));
    }catch(error){
      const operational=operationalFailure(error);
      if(!operational)throw error;
      unavailable.push(frozenUnavailable({
        peerId:config.peerId,
        nodeId:record.nodeId,
        category:operational.category,
        retryAt:operational.retryAt
      }));
    }
  }

  const relay=new MachineBridgeMeshRelay({
    nodeId,
    peers:resolvedPeers,
    now,
    receiptSigner,
    requireSignedReceipts,
    trustStore,
    peerSelector:selector.asMeshPeerSelector(),
    requestOwnership
  });

  const assembledAt=new Date(now());
  if(!Number.isFinite(assembledAt.getTime()))throw new Error("invalid federation runtime assembly time");
  const snapshot=Object.freeze({
    format:ARCA_FEDERATION_RUNTIME_FORMAT,
    version:1,
    relayNodeId:nodeId,
    assembledAt:assembledAt.toISOString(),
    configuredPeerCount:configs.length,
    resolvedPeerCount:resolvedPublic.length,
    unavailablePeerCount:unavailable.length,
    resolvedPeers:Object.freeze([...resolvedPublic]),
    unavailablePeers:Object.freeze([...unavailable]),
    signedReceiptsRequired:requireSignedReceipts,
    requestOwnershipEnabled:requestOwnership!==null&&requestOwnership!==undefined
  });

  return Object.freeze({
    format:ARCA_FEDERATION_RUNTIME_FORMAT,
    version:1,
    relayNodeId:nodeId,
    relay,
    selector,
    snapshot:()=>snapshot,
    advertise:()=>relay.advertise(),
    forward:envelope=>relay.forward(envelope)
  });
}
