import {createHash} from "node:crypto";

const SESSION_FORMAT="arca-creator-session-v1";
const AUDIT_FORMAT="arca-creator-audit-v1";
const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const AUTH_METHODS=new Set(["webauthn","hardware-key","recovery","local-bootstrap"]);
const SECRET_KEYS=/^(authorization|token|password|secret|apikey|api_key|clientsecret|client_secret|privatekey|private_key)$/i;

export const CREATOR_SCOPES=Object.freeze([
  "creator.chat",
  "creator.read",
  "creator.review",
  "creator.propose-change",
  "creator.authorize-network",
  "creator.manage-agents",
  "creator.freeze"
] as const);

export type CreatorScope=(typeof CREATOR_SCOPES)[number];
export type CreatorAuthMethod="webauthn"|"hardware-key"|"recovery"|"local-bootstrap";
export type CreatorRisk="low"|"elevated"|"high";

export type CreatorSession={
  format:typeof SESSION_FORMAT;
  sessionId:string;
  subject:string;
  scopes:CreatorScope[];
  authMethod:CreatorAuthMethod;
  credentialIdHash:string;
  issuedAt:string;
  expiresAt:string;
  stepUpAt?:string;
};

export type CreatorCommand={
  commandId:string;
  type:string;
  requestId?:string;
  payload?:Record<string,unknown>;
  confirmationId?:string;
};

export type CreatorAuthorization={
  allowed:boolean;
  commandId:string;
  type:string;
  risk:CreatorRisk;
  reason:string;
  requiredScope?:CreatorScope;
};

type CommandRule={scope:CreatorScope;risk:CreatorRisk;recoveryAllowed:boolean};

const RULES:Record<string,CommandRule>=Object.freeze({
  "chat.send":{scope:"creator.chat",risk:"low",recoveryAllowed:false},
  "state.read":{scope:"creator.read",risk:"low",recoveryAllowed:true},
  "review.read":{scope:"creator.review",risk:"elevated",recoveryAllowed:false},
  "review.decide":{scope:"creator.review",risk:"elevated",recoveryAllowed:false},
  "change.propose":{scope:"creator.propose-change",risk:"elevated",recoveryAllowed:false},
  "workflow.read":{scope:"creator.propose-change",risk:"elevated",recoveryAllowed:false},
  "workflow.propose":{scope:"creator.propose-change",risk:"elevated",recoveryAllowed:false},
  "workflow.register":{scope:"creator.propose-change",risk:"elevated",recoveryAllowed:false},
  "workflow.reason":{scope:"creator.propose-change",risk:"elevated",recoveryAllowed:false},
  "network.authorize":{scope:"creator.authorize-network",risk:"high",recoveryAllowed:false},
  "agents.manage":{scope:"creator.manage-agents",risk:"high",recoveryAllowed:false},
  "system.freeze":{scope:"creator.freeze",risk:"high",recoveryAllowed:true}
});

function parseTime(value:string,label:string){const ms=Date.parse(value);if(!Number.isFinite(ms))throw new Error(`invalid ${label}`);return ms}
function hashText(value:string){return createHash("sha256").update(value).digest("hex")}
function normalizeId(value:unknown,label:string){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error(`invalid ${label}`);return value}
function hasSecretField(value:unknown):boolean{
  if(!value||typeof value!=="object")return false;
  if(Array.isArray(value))return value.some(hasSecretField);
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
    if(SECRET_KEYS.test(key))return true;
    if(hasSecretField(item))return true;
  }
  return false;
}
function canonical(value:unknown):string{
  if(value===undefined)return "null";
  if(value===null||typeof value!=="object")return JSON.stringify(value)??"null";
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function normalizeCreatorSession(input:CreatorSession):CreatorSession{
  if(!input||typeof input!=="object"||input.format!==SESSION_FORMAT)throw new Error("invalid creator session format");
  const sessionId=normalizeId(input.sessionId,"creator session id");
  const subject=normalizeId(input.subject,"creator subject");
  if(!Array.isArray(input.scopes)||input.scopes.length===0)throw new Error("creator session scopes required");
  const scopes=[...new Set(input.scopes)];
  if(scopes.some(scope=>!CREATOR_SCOPES.includes(scope)))throw new Error("invalid creator scope");
  if(!AUTH_METHODS.has(input.authMethod))throw new Error("invalid creator auth method");
  if(typeof input.credentialIdHash!=="string"||!HASH.test(input.credentialIdHash))throw new Error("invalid credential id hash");
  const issued=parseTime(input.issuedAt,"issuedAt");
  const expires=parseTime(input.expiresAt,"expiresAt");
  if(expires<=issued)throw new Error("creator session expiry must follow issuance");
  if(expires-issued>60*60*1000)throw new Error("creator session lifetime exceeds one hour");
  if(input.stepUpAt){const step=parseTime(input.stepUpAt,"stepUpAt");if(step<issued||step>expires)throw new Error("invalid creator step-up time")}
  if(input.authMethod==="local-bootstrap"&&scopes.some(scope=>scope!=="creator.chat"&&scope!=="creator.read"))throw new Error("local bootstrap session exceeds low-risk scopes");
  if(hasSecretField(input))throw new Error("creator session must not contain raw secrets");
  return {...input,sessionId,subject,scopes:[...scopes].sort()};
}

export function authorizeCreatorCommand(sessionInput:CreatorSession,command:CreatorCommand,{now=new Date(),maxStepUpAgeMs=5*60*1000}:{now?:Date;maxStepUpAgeMs?:number}={}):CreatorAuthorization{
  const session=normalizeCreatorSession(sessionInput);
  normalizeId(command?.commandId,"creator command id");
  if(typeof command?.type!=="string"||!command.type)throw new Error("creator command type required");
  if(command.requestId)normalizeId(command.requestId,"creator request id");
  if(command.confirmationId)normalizeId(command.confirmationId,"creator confirmation id");
  if(hasSecretField(command.payload))return {allowed:false,commandId:command.commandId,type:command.type,risk:"high",reason:"raw secrets are forbidden in creator commands"};
  const rule=RULES[command.type];
  if(!rule)return {allowed:false,commandId:command.commandId,type:command.type,risk:"high",reason:"command is not in the Creator Action Registry"};
  const nowMs=now.getTime();
  if(nowMs<parseTime(session.issuedAt,"issuedAt")||nowMs>=parseTime(session.expiresAt,"expiresAt"))return {allowed:false,commandId:command.commandId,type:command.type,risk:rule.risk,reason:"creator session is not active",requiredScope:rule.scope};
  if(!session.scopes.includes(rule.scope))return {allowed:false,commandId:command.commandId,type:command.type,risk:rule.risk,reason:"required creator scope is missing",requiredScope:rule.scope};
  if(session.authMethod==="local-bootstrap"&&rule.risk!=="low")return {allowed:false,commandId:command.commandId,type:command.type,risk:rule.risk,reason:"local bootstrap authentication is limited to low-risk chat/read operations",requiredScope:rule.scope};
  if(session.authMethod==="recovery"&&!rule.recoveryAllowed)return {allowed:false,commandId:command.commandId,type:command.type,risk:rule.risk,reason:"recovery authentication is limited to read/freeze operations",requiredScope:rule.scope};
  if(rule.risk==="high"){
    if(!command.confirmationId)return {allowed:false,commandId:command.commandId,type:command.type,risk:rule.risk,reason:"high-risk creator command requires explicit confirmation",requiredScope:rule.scope};
    if(!session.stepUpAt)return {allowed:false,commandId:command.commandId,type:command.type,risk:rule.risk,reason:"high-risk creator command requires recent step-up authentication",requiredScope:rule.scope};
    const age=nowMs-parseTime(session.stepUpAt,"stepUpAt");
    if(age<0||age>maxStepUpAgeMs)return {allowed:false,commandId:command.commandId,type:command.type,risk:rule.risk,reason:"creator step-up authentication is stale",requiredScope:rule.scope};
  }
  return {allowed:true,commandId:command.commandId,type:command.type,risk:rule.risk,reason:"authorized by Creator Control Plane policy",requiredScope:rule.scope};
}

export type CreatorAuditEvent={
  format:typeof AUDIT_FORMAT;
  sequence:number;
  at:string;
  sessionId:string;
  subject:string;
  commandId:string;
  commandType:string;
  requestId?:string;
  decision:"allowed"|"denied";
  reason:string;
  payloadHash:string;
  previousHash:string;
  eventHash:string;
};

export function createCreatorAuditEvent(previousHash:string|undefined,{session,command,authorization,sequence,at=new Date()}:{session:CreatorSession;command:CreatorCommand;authorization:CreatorAuthorization;sequence:number;at?:Date}):CreatorAuditEvent{
  const normalized=normalizeCreatorSession(session);
  if(!Number.isInteger(sequence)||sequence<1)throw new Error("invalid creator audit sequence");
  const prev=previousHash||"0".repeat(64);if(!HASH.test(prev))throw new Error("invalid previous creator audit hash");
  const base={
    format:AUDIT_FORMAT,sequence,at:at.toISOString(),sessionId:normalized.sessionId,subject:normalized.subject,
    commandId:normalizeId(command.commandId,"creator command id"),commandType:command.type,
    ...(command.requestId?{requestId:normalizeId(command.requestId,"creator request id")}:{ }),
    decision:authorization.allowed?"allowed":"denied",reason:authorization.reason,
    payloadHash:hashText(canonical(command.payload||{})),previousHash:prev
  } as const;
  return {...base,eventHash:hashText(canonical(base))};
}

export function verifyCreatorAuditChain(events:CreatorAuditEvent[]):boolean{
  let previous="0".repeat(64);let sequence=1;
  for(const event of events){
    if(event?.format!==AUDIT_FORMAT||event.sequence!==sequence||event.previousHash!==previous||!HASH.test(event.eventHash))return false;
    const {eventHash,...base}=event;if(hashText(canonical(base))!==eventHash)return false;
    previous=eventHash;sequence++;
  }
  return true;
}

export function creatorActionRegistry(){return Object.entries(RULES).map(([type,rule])=>({type,...rule}));}
