import {createHash} from "node:crypto";
import {GitHubOpaqueRpcMailboxTransport} from "./github-opaque-rpc-mailbox.mjs";
import {DurableOpaqueRpcRelayContinuation} from "./github-opaque-rpc-continuation.mjs";
import {createOpaqueMeshRpcRequest} from "./mesh-opaque-rpc.mjs";
import {
  MeshEncryptedEnvelopeReplayGuard,
  decryptMeshPayload,
  verifyMeshEncryptionRecipient
} from "./mesh-encrypted-envelope.mjs";

export const ARCA_DURABLE_OPAQUE_RPC_ORIGIN_SUBMISSION_FORMAT="arca-durable-opaque-rpc-origin-submission-v1";
export const ARCA_DURABLE_OPAQUE_RPC_ORIGIN_RESULT_FORMAT="arca-durable-opaque-rpc-origin-result-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_HOPS=16;
const MAX_TTL_MS=15*60*1000;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(plain(value)){
    const out={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonicalize(value[key]);
    return out;
  }
  return value;
}
function stable(value){return JSON.stringify(canonicalize(value))}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeId(value,label){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);return value}
function capabilities(values=[]){
  if(!Array.isArray(values))throw new TypeError("durable opaque origin capabilities must be array");
  const out=[...new Set(values.map(String).map(value=>value.trim()).filter(Boolean))].sort();
  if(out.some(value=>value.length>160))throw new Error("durable opaque origin capability too long");
  return out;
}
function bodyForEvidence(value){
  const {evidenceHash:_ignored,output:_output,...body}=value;
  return body;
}

export class DurableOpaqueRpcPendingError extends Error{
  constructor(submission){
    super("durable opaque RPC result pending: "+submission.requestId);
    this.name="DurableOpaqueRpcPendingError";
    this.submission=submission;
    this.retryable=true;
  }
}

export class DurableOpaqueRpcOriginClient{
  constructor({
    originNode,
    mailbox,
    entryRelay,
    nextNode,
    recipient,
    replyRecipient,
    replyPrivateKey,
    trustStore,
    requiredCapabilities=[],
    now=()=>new Date(),
    responseReplayGuard=null
  }={}){
    this.originNode=safeId(originNode,"durable opaque origin node");
    if(!(mailbox instanceof GitHubOpaqueRpcMailboxTransport))throw new TypeError("GitHubOpaqueRpcMailboxTransport required");
    if(!(entryRelay instanceof DurableOpaqueRpcRelayContinuation))throw new TypeError("DurableOpaqueRpcRelayContinuation required");
    this.nextNode=safeId(nextNode,"durable opaque origin nextNode");
    if(typeof now!=="function")throw new TypeError("durable opaque origin clock required");
    if(!trustStore||typeof trustStore.verify!=="function")throw new TypeError("durable opaque origin trustStore required");
    if(mailbox.requireSignedReceipts!==true)throw new Error("durable opaque origin requires signed receipts");
    if(entryRelay.requireSignedReceipts!==true)throw new Error("durable opaque origin entry relay must require signed receipts");
    if(entryRelay.nodeId===this.originNode)throw new Error("durable opaque origin and entry relay must differ");
    verifyMeshEncryptionRecipient(recipient,{trustStore,now:new Date(now()),clockSkewMs:mailbox.clockSkewMs});
    verifyMeshEncryptionRecipient(replyRecipient,{trustStore,now:new Date(now()),clockSkewMs:mailbox.clockSkewMs});
    if(replyRecipient.payload.nodeId!==this.originNode)throw new Error("durable opaque reply recipient must belong to origin node");
    if(!replyPrivateKey)throw new TypeError("durable opaque reply private key required");
    if(responseReplayGuard!==null&&!(responseReplayGuard instanceof MeshEncryptedEnvelopeReplayGuard))throw new TypeError("MeshEncryptedEnvelopeReplayGuard required");
    this.mailbox=mailbox;
    this.entryRelay=entryRelay;
    this.recipient=recipient;
    this.replyRecipient=replyRecipient;
    this.replyPrivateKey=replyPrivateKey;
    this.trustStore=trustStore;
    this.requiredCapabilities=capabilities(requiredCapabilities);
    this.now=now;
    this.responseReplayGuard=responseReplayGuard;
  }

  async status(requestId){
    safeId(requestId,"durable opaque origin requestId");
    const terminal=await this.mailbox.getResult(requestId);
    if(terminal)return Object.freeze({
      state:"completed",
      requestId,
      resultHash:terminal.result.resultHash,
      requestPacketHash:terminal.requestPacket.packetHash
    });
    const current=await this.entryRelay.continuations.getContinuation(this.entryRelay.nodeId,requestId);
    if(current)return Object.freeze({
      state:current.continuation.status,
      requestId,
      requestPacketHash:current.continuation.receivedPacketHash,
      continuationHash:current.continuation.continuationHash
    });
    return Object.freeze({state:"missing",requestId});
  }

  #assertExistingCorrelation(continuation,{payloadId,recipientStatementHash}){
    const packet=continuation.receivedPacket;
    if(packet.originNode!==this.originNode)throw new Error("durable opaque origin existing request origin mismatch");
    if(packet.payloadId!==payloadId)throw new Error("durable opaque origin existing request payloadId mismatch");
    if(packet.recipient?.statementHash!==recipientStatementHash)throw new Error("durable opaque origin existing recipient mismatch");
    if(packet.replyRecipient?.statementHash!==this.replyRecipient.statementHash)throw new Error("durable opaque origin existing reply recipient mismatch");
    if(packet.receipts?.length!==0)throw new Error("durable opaque origin expected pre-entry request state");
    return true;
  }

  async submit(payload,{
    requestId,
    payloadId,
    requiredCapabilities=this.requiredCapabilities,
    maxHops=8,
    ttlMs=5*60*1000,
    processorId="opaque-origin-submit"
  }={}){
    safeId(requestId,"durable opaque origin requestId");
    safeId(payloadId,"durable opaque origin payloadId");
    safeId(processorId,"durable opaque origin processorId");
    const required=capabilities(requiredCapabilities);
    if(!Number.isSafeInteger(maxHops)||maxHops<1||maxHops>MAX_HOPS)throw new Error("invalid durable opaque origin maxHops");
    if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>MAX_TTL_MS)throw new Error("invalid durable opaque origin ttlMs");

    const terminal=await this.mailbox.getResult(requestId);
    if(terminal){
      if(terminal.requestPacket.payloadId!==payloadId)throw new Error("durable opaque origin completed request payloadId mismatch");
      if(terminal.requestPacket.recipient?.statementHash!==this.recipient.statementHash)throw new Error("durable opaque origin completed request recipient mismatch");
      return Object.freeze({
        format:ARCA_DURABLE_OPAQUE_RPC_ORIGIN_SUBMISSION_FORMAT,
        version:1,
        requestId,
        payloadId,
        state:"completed",
        idempotent:true,
        requestPacketHash:terminal.requestPacket.packetHash,
        requestEnvelopeHash:terminal.requestPacket.requestEnvelope.envelopeHash,
        resultHash:terminal.result.resultHash,
        returnedImmediately:true
      });
    }

    const existing=await this.entryRelay.continuations.getContinuation(this.entryRelay.nodeId,requestId);
    if(existing){
      this.#assertExistingCorrelation(existing.continuation,{payloadId,recipientStatementHash:this.recipient.statementHash});
      return Object.freeze({
        format:ARCA_DURABLE_OPAQUE_RPC_ORIGIN_SUBMISSION_FORMAT,
        version:1,
        requestId,
        payloadId,
        state:existing.continuation.status,
        idempotent:true,
        requestPacketHash:existing.continuation.receivedPacketHash,
        requestEnvelopeHash:existing.continuation.receivedPacket.requestEnvelope.envelopeHash,
        continuationHash:existing.continuation.continuationHash,
        returnedImmediately:true
      });
    }

    const now=new Date(this.now());
    const packet=createOpaqueMeshRpcRequest(payload,{
      requestId,
      payloadId,
      originNode:this.originNode,
      recipient:this.recipient,
      replyRecipient:this.replyRecipient,
      requiredCapabilities:required,
      maxHops,
      ttlMs,
      trustStore:this.trustStore,
      now,
      clockSkewMs:this.mailbox.clockSkewMs
    });
    const handoff=await this.entryRelay.forwardAndReturn(packet,{
      nextNode:this.nextNode,
      processorId,
      claimQueued:false
    });
    if(handoff.state!=="waiting-reply"&&handoff.state!=="completed")throw new Error("durable opaque origin initial handoff failed: "+handoff.state);
    return Object.freeze({
      format:ARCA_DURABLE_OPAQUE_RPC_ORIGIN_SUBMISSION_FORMAT,
      version:1,
      requestId,
      payloadId,
      state:handoff.state,
      idempotent:false,
      requestPacketHash:packet.packetHash,
      requestEnvelopeHash:packet.requestEnvelope.envelopeHash,
      continuationHash:handoff.continuationHash??null,
      returnedImmediately:true
    });
  }

  async collect(requestId,{payloadId}={}){
    safeId(requestId,"durable opaque origin requestId");
    if(payloadId!==undefined)safeId(payloadId,"durable opaque origin payloadId");
    const terminal=await this.mailbox.getResult(requestId);
    if(!terminal)return null;
    const packet=terminal.requestPacket;
    const result=terminal.result;
    if(packet.originNode!==this.originNode)throw new Error("durable opaque origin terminal origin mismatch");
    if(payloadId!==undefined&&packet.payloadId!==payloadId)throw new Error("durable opaque origin terminal payloadId mismatch");
    if(packet.recipient?.statementHash!==this.recipient.statementHash)throw new Error("durable opaque origin terminal recipient mismatch");
    if(packet.replyRecipient?.statementHash!==this.replyRecipient.statementHash)throw new Error("durable opaque origin terminal reply recipient mismatch");
    const opened=decryptMeshPayload(result.responseEnvelope,{
      recipient:this.replyRecipient,
      recipientPrivateKey:this.replyPrivateKey,
      trustStore:this.trustStore,
      replayGuard:this.responseReplayGuard,
      now:new Date(result.responseEnvelope.issuedAt),
      clockSkewMs:this.mailbox.clockSkewMs
    });
    if(result.requestId!==requestId||result.payloadId!==packet.payloadId)throw new Error("durable opaque origin result correlation mismatch");
    const evidenceBody={
      format:ARCA_DURABLE_OPAQUE_RPC_ORIGIN_RESULT_FORMAT,
      version:1,
      requestId,
      payloadId:packet.payloadId,
      endpointNode:result.endpointNode,
      requestPacketHash:packet.packetHash,
      requestEnvelopeHash:packet.requestEnvelope.envelopeHash,
      responseEnvelopeHash:result.responseEnvelope.envelopeHash,
      resultHash:result.resultHash,
      recipientIdentityId:packet.recipient.payload.identityId,
      recipientKeyFingerprint:packet.recipient.payload.keyFingerprint,
      route:[...result.route],
      replyRoute:[...result.replyRoute],
      signedReceiptsVerified:true,
      trustedRecipientIdentity:true,
      durableContinuation:true,
      ciphertextOnlyProtocol:true,
      responsePayloadHash:opened.proof.payloadHash
    };
    const evidence={...evidenceBody,evidenceHash:sha256(evidenceBody)};
    return Object.freeze({...evidence,output:opened.payload});
  }

  async runOrPend(payload,options={}){
    const requestId=safeId(options.requestId,"durable opaque origin requestId");
    const payloadId=safeId(options.payloadId,"durable opaque origin payloadId");
    const completed=await this.collect(requestId,{payloadId});
    if(completed)return completed;
    const submission=await this.submit(payload,{...options,requestId,payloadId});
    const raced=await this.collect(requestId,{payloadId});
    if(raced)return raced;
    throw new DurableOpaqueRpcPendingError(submission);
  }
}

export function verifyDurableOpaqueRpcOriginResult(value){
  if(!plain(value)||value.format!==ARCA_DURABLE_OPAQUE_RPC_ORIGIN_RESULT_FORMAT||value.version!==1)return false;
  if(!SAFE_ID.test(value.requestId||"")||!SAFE_ID.test(value.payloadId||"")||!SAFE_ID.test(value.endpointNode||""))return false;
  for(const key of ["requestPacketHash","requestEnvelopeHash","responseEnvelopeHash","resultHash","recipientKeyFingerprint","responsePayloadHash","evidenceHash"]){
    if(typeof value[key]!=="string"||!HASH.test(value[key]))return false;
  }
  if(value.signedReceiptsVerified!==true||value.trustedRecipientIdentity!==true||value.durableContinuation!==true||value.ciphertextOnlyProtocol!==true)return false;
  return value.evidenceHash===sha256(bodyForEvidence(value));
}
