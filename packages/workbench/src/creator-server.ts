import {appendFile,mkdir,readFile} from "node:fs/promises";
import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {ArcaCore} from "../../core/src/index.ts";
import {
  CreatorPasskeyRegistry,
  CreatorSessionStore,
  CreatorWorkflowProposalService,
  CreatorWorkflowReasoningService,
  HumanReviewQueue,
  ReviewGatedContinuation,
  authorizeCreatorCommand,
  createCreatorAuditEvent,
  verifyCreatorAuditChain,
  type CreatorAuditEvent,
  type CreatorCommand,
  type CreatorSession
} from "../../agent/src/index.ts";

export const CREATOR_CONSOLE_VERSION="0.4.0";
export const DEFAULT_CREATOR_CONSOLE_PORT=4318;
export const MAX_CREATOR_REQUEST_BYTES=64*1024;

const PUBLIC_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"../public");
const STATIC_FILES:Record<string,{file:string;type:string}>={
  "/":{file:"creator.html",type:"text/html; charset=utf-8"},
  "/creator.html":{file:"creator.html",type:"text/html; charset=utf-8"},
  "/creator.js":{file:"creator.js",type:"text/javascript; charset=utf-8"},
  "/creator.css":{file:"creator.css",type:"text/css; charset=utf-8"}
};
const SAFE_REQUEST_ID=/^[A-Za-z0-9._:-]{1,160}$/;

class HttpError extends Error{
  readonly status:number;readonly code:string;
  constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code}
}

function isLoopback(host:string){const value=host.trim().toLowerCase().replace(/^\[|\]$/g,"");return value==="127.0.0.1"||value==="localhost"||value==="::1"}
function requestHostname(hostHeader:string){try{return new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g,"").toLowerCase()}catch{throw new HttpError(400,"INVALID_HOST","Cabeçalho Host inválido")}}
function setHeaders(response:ServerResponse){
  response.setHeader("Content-Security-Policy","default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("X-Content-Type-Options","nosniff");response.setHeader("X-Frame-Options","DENY");response.setHeader("Referrer-Policy","no-referrer");
  response.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=(), usb=(), publickey-credentials-get=(self), publickey-credentials-create=(self)");response.setHeader("Cross-Origin-Resource-Policy","same-origin");response.setHeader("Cache-Control","no-store");
}
function sendJson(response:ServerResponse,status:number,value:unknown){const body=`${JSON.stringify(value,null,2)}\n`;response.statusCode=status;response.setHeader("Content-Type","application/json; charset=utf-8");response.setHeader("Content-Length",Buffer.byteLength(body));response.end(body)}
function sendText(response:ServerResponse,status:number,body:string,type:string){response.statusCode=status;response.setHeader("Content-Type",type);response.setHeader("Content-Length",Buffer.byteLength(body));response.end(body)}
async function readJson(request:IncomingMessage){
  const type=String(request.headers["content-type"]??"").split(";",1)[0].trim().toLowerCase();if(type!=="application/json")throw new HttpError(415,"JSON_REQUIRED","Content-Type application/json é obrigatório");
  const declared=Number(request.headers["content-length"]??0);if(Number.isFinite(declared)&&declared>MAX_CREATOR_REQUEST_BYTES)throw new HttpError(413,"BODY_TOO_LARGE","Corpo excede limite do Creator Console");
  const chunks:Buffer[]=[];let total=0;for await(const chunk of request){const value=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);total+=value.length;if(total>MAX_CREATOR_REQUEST_BYTES)throw new HttpError(413,"BODY_TOO_LARGE","Corpo excede limite do Creator Console");chunks.push(value)}
  if(!total)throw new HttpError(400,"EMPTY_BODY","Corpo JSON obrigatório");
  try{const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("objeto JSON obrigatório");return value as Record<string,any>}catch(error:any){throw new HttpError(400,"INVALID_JSON",String(error?.message??"JSON inválido"))}
}
function requestOriginAllowed(request:IncomingMessage,hostHeader:string){
  const origin=request.headers.origin;if(!origin)return;
  try{const parsed=new URL(origin);if(!["http:","https:"].includes(parsed.protocol)||parsed.host.toLowerCase()!==hostHeader.toLowerCase())throw new Error()}catch{throw new HttpError(403,"ORIGIN_REJECTED","Origin não autorizada")}
}
function creatorToken(request:IncomingMessage){const raw=request.headers["x-arca-creator-session"];return Array.isArray(raw)?raw[0]:raw}
function commandId(){return `cmd-${randomUUID()}`}
function requestId(value:unknown){if(value===undefined||value===null||value==="")return `req-${randomUUID()}`;if(typeof value!=="string"||!SAFE_REQUEST_ID.test(value))throw new HttpError(400,"INVALID_REQUEST_ID","requestId inválido");return value}
function requiredRequestId(value:unknown){if(typeof value!=="string"||!SAFE_REQUEST_ID.test(value))throw new HttpError(400,"REQUEST_ID_REQUIRED","requestId válido é obrigatório");return value}
function strongSession(session:CreatorSession){return session.authMethod==="webauthn"||session.authMethod==="hardware-key"}
function publicSession(session:CreatorSession){return {sessionId:session.sessionId,subject:session.subject,scopes:session.scopes,authMethod:session.authMethod,issuedAt:session.issuedAt,expiresAt:session.expiresAt,stepUpAt:session.stepUpAt??null,strong:strongSession(session)}}

export type CreatorChatHandler=(input:{message:string;requestId:string;session:CreatorSession;context:{home:string}})=>Promise<unknown>|unknown;
export type CreatorChatStatusHandler=(input:{requestId:string;session:CreatorSession;context:{home:string}})=>Promise<unknown>|unknown;
export type CreatorChatCollectHandler=CreatorChatStatusHandler;
export type CreatorChatListHandler=(input:{session:CreatorSession;context:{home:string}})=>Promise<unknown>|unknown;
export interface CreatorConsoleOptions{home:string;host?:string;port?:number;chatHandler?:CreatorChatHandler;chatStatusHandler?:CreatorChatStatusHandler;chatCollectHandler?:CreatorChatCollectHandler;chatListHandler?:CreatorChatListHandler;workflowProposalService?:CreatorWorkflowProposalService;workflowReasoningService?:CreatorWorkflowReasoningService;bootstrapTtlMs?:number;sessionTtlMs?:number;passkeyChallengeTtlMs?:number}

export function createCreatorConsoleServer(options:CreatorConsoleOptions){
  if(!options?.home)throw new Error("home é obrigatório");
  const host=options.host??"127.0.0.1";const port=options.port??DEFAULT_CREATOR_CONSOLE_PORT;
  if(!isLoopback(host))throw new Error("Creator Console V1 aceita somente bind loopback local");
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error(`Porta inválida: ${port}`);
  const home=resolve(options.home);const core=new ArcaCore(home);const reviews=new HumanReviewQueue(home);const reviewGate=new ReviewGatedContinuation(reviews);
  const sessions=new CreatorSessionStore({bootstrapTtlMs:options.bootstrapTtlMs,sessionTtlMs:options.sessionTtlMs});
  const auditRoot=join(home,"creator-control");const auditPath=join(auditRoot,"audit.jsonl");
  const startedAt=new Date().toISOString();let auditEvents:CreatorAuditEvent[]=[];let auditQueue=Promise.resolve();let bootstrap:{code:string;expiresAt:string}|null=null;let passkeys:CreatorPasskeyRegistry|null=null;let enrollmentLock=Promise.resolve();

  const initAudit=async()=>{await mkdir(auditRoot,{recursive:true});try{const text=await readFile(auditPath,"utf8");auditEvents=text.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));if(!verifyCreatorAuditChain(auditEvents))throw new Error("Creator audit chain inválida")}catch(error:any){if(error?.code!=="ENOENT")throw error}};
  const audit=async(session:CreatorSession,command:CreatorCommand,authorization:ReturnType<typeof authorizeCreatorCommand>)=>{
    auditQueue=auditQueue.then(async()=>{const previous=auditEvents.at(-1)?.eventHash;const event=createCreatorAuditEvent(previous,{session,command,authorization,sequence:auditEvents.length+1});await appendFile(auditPath,`${JSON.stringify(event)}\n`,"utf8");auditEvents.push(event)});await auditQueue;
  };
  const authenticate=(request:IncomingMessage)=>{const token=creatorToken(request);const session=token?sessions.resolve(token):null;if(!session)throw new HttpError(401,"CREATOR_SESSION_REQUIRED","Sessão Creator ausente, inválida ou expirada");return {token:token!,session}};
  const authorize=async(session:CreatorSession,command:CreatorCommand)=>{const decision=authorizeCreatorCommand(session,command);await audit(session,command,decision);if(!decision.allowed)throw new HttpError(403,"CREATOR_COMMAND_DENIED",decision.reason);return decision};
  const requirePasskeyHost=(hostHeader:string)=>{if(requestHostname(hostHeader)!=="localhost")throw new HttpError(409,"PASSKEY_LOCALHOST_REQUIRED","Cerimônias passkey locais exigem abrir o Creator Console pelo host localhost")};

  let server:ReturnType<typeof createServer>;
  const getPasskeys=async()=>{
    if(passkeys)return passkeys;
    const address=server.address();if(!address||typeof address==="string")throw new HttpError(503,"PASSKEY_NOT_READY","Servidor ainda não possui porta para WebAuthn");
    passkeys=new CreatorPasskeyRegistry(home,{rpId:"localhost",allowedOrigins:[`http://localhost:${address.port}`],challengeTtlMs:options.passkeyChallengeTtlMs});await passkeys.init();return passkeys;
  };
  const withEnrollmentLock=async<T>(fn:()=>Promise<T>)=>{let release!:()=>void;const previous=enrollmentLock;enrollmentLock=new Promise<void>(resolveLock=>{release=resolveLock});await previous;try{return await fn()}finally{release()}};
  const ensureFirstEnrollmentSession=async(session:CreatorSession)=>{if(session.authMethod!=="local-bootstrap")throw new HttpError(403,"FIRST_PASSKEY_BOOTSTRAP_REQUIRED","Primeira passkey exige sessão local-bootstrap ativa");const registry=await getPasskeys();const existing=await registry.list();if(existing.length)throw new HttpError(409,"PASSKEY_ALREADY_ENROLLED","Já existe uma passkey; local-bootstrap não pode cadastrar credenciais adicionais");return registry};
  const requirePasskeyHeader=(request:IncomingMessage)=>{if(request.headers["x-arca-creator-passkey"]!=="1")throw new HttpError(403,"PASSKEY_HEADER_REQUIRED","Cabeçalho de cerimônia passkey obrigatório")};
  const requireEnrollmentHeader=(request:IncomingMessage)=>{if(request.headers["x-arca-creator-passkey-enroll"]!=="first")throw new HttpError(403,"PASSKEY_ENROLL_HEADER_REQUIRED","Confirmação explícita de first-passkey enrollment obrigatória")};

  server=createServer(async(request,response)=>{
    setHeaders(response);
    try{
      const hostHeader=String(request.headers.host??"");if(!hostHeader)throw new HttpError(400,"HOST_REQUIRED","Cabeçalho Host obrigatório");
      if(!isLoopback(requestHostname(hostHeader)))throw new HttpError(403,"REMOTE_HOST_REJECTED","Creator Console aceita somente acesso loopback");
      requestOriginAllowed(request,hostHeader);
      const method=request.method??"GET";const url=new URL(request.url??"/",`http://${hostHeader}`);

      if(method==="GET"&&url.pathname==="/api/health"){sendJson(response,200,{ok:true,service:"arca-creator-console",version:CREATOR_CONSOLE_VERSION,localOnly:true,passkeyFoundation:true,startedAt});return}
      if(method==="POST"&&url.pathname==="/api/unlock"){
        if(request.headers["x-arca-creator-unlock"]!=="1")throw new HttpError(403,"UNLOCK_HEADER_REQUIRED","Cabeçalho de desbloqueio obrigatório");
        const body=await readJson(request);try{const grant=sessions.exchangeBootstrap(String(body.code??""));sendJson(response,200,{format:"arca-creator-local-grant-v1",token:grant.token,session:publicSession(grant.session)})}catch(error:any){throw new HttpError(401,"CREATOR_UNLOCK_REJECTED",String(error?.message??error))}return
      }
      if(method==="POST"&&url.pathname==="/api/logout"){
        const {token,session}=authenticate(request);const command={commandId:commandId(),type:"state.read",payload:{operation:"logout"}};await authorize(session,command);sessions.revoke(token);sendJson(response,200,{ok:true});return
      }
      if(method==="GET"&&url.pathname==="/api/session"){
        const {session}=authenticate(request);sendJson(response,200,{session:publicSession(session)});return
      }
      if(method==="GET"&&url.pathname==="/api/state"){
        const {session}=authenticate(request);const rid=requestId(url.searchParams.get("requestId"));const command={commandId:commandId(),type:"state.read",requestId:rid,payload:{view:"summary"}};await authorize(session,command);
        const investigations=await core.list();const pendingReviews=await reviews.list({status:"pending"});const registry=await getPasskeys();const credentialRecords=await registry.publicList();const activePasskeys=credentialRecords.filter(item=>!item.revokedAt).length;
        sendJson(response,200,{format:"arca-creator-state-v1",requestId:rid,creatorConsoleVersion:CREATOR_CONSOLE_VERSION,agent:"arca-primary",agentAvailable:typeof options.chatHandler==="function",chat:{asyncStatus:typeof options.chatStatusHandler==="function",collect:typeof options.chatCollectHandler==="function",pendingList:typeof options.chatListHandler==="function"},workflows:{structuredProposal:options.workflowProposalService instanceof CreatorWorkflowProposalService,reasoningBinding:options.workflowReasoningService instanceof CreatorWorkflowReasoningService},investigations:{count:investigations.length},humanReview:{pending:pendingReviews.length},audit:{events:auditEvents.length,head:auditEvents.at(-1)?.eventHash??null},security:{sessionAuthMethod:session.authMethod,strongSession:strongSession(session),stepUpAt:session.stepUpAt??null,passkeys:{count:credentialRecords.length,active:activePasskeys,canEnrollFirst:credentialRecords.length===0&&session.authMethod==="local-bootstrap",browserOriginRequired:"localhost"}},localOnly:true,startedAt});return
      }
      if(method==="GET"&&url.pathname==="/api/workflows/capabilities"){
        const {session}=authenticate(request);const command={commandId:commandId(),type:"workflow.read",payload:{operation:"capabilities"}};await authorize(session,command);
        if(!(options.workflowProposalService instanceof CreatorWorkflowProposalService))throw new HttpError(503,"WORKFLOW_PROPOSALS_UNAVAILABLE","Este host não expõe planejamento estruturado de workflows");
        sendJson(response,200,options.workflowProposalService.describe());return
      }
      if(method==="GET"&&url.pathname==="/api/workflows/proposals"){
        const {session}=authenticate(request);const requestedStatus=String(url.searchParams.get("status")??"all").trim().toLowerCase();if(!["all","blocked","ready","registered"].includes(requestedStatus))throw new HttpError(400,"INVALID_WORKFLOW_PROPOSAL_STATUS","status de workflow proposal inválido");
        const command={commandId:commandId(),type:"workflow.read",payload:{operation:"list",status:requestedStatus}};await authorize(session,command);
        if(!(options.workflowProposalService instanceof CreatorWorkflowProposalService))throw new HttpError(503,"WORKFLOW_PROPOSALS_UNAVAILABLE","Este host não expõe planejamento estruturado de workflows");
        const items=await options.workflowProposalService.list(requestedStatus==="all"?{}:{status:requestedStatus});sendJson(response,200,{format:"arca-creator-workflow-proposal-list-v1",items});return
      }
      if(method==="POST"&&url.pathname==="/api/workflows/propose"){
        const {session}=authenticate(request);const body=await readJson(request);const rid=requiredRequestId(body.requestId);const command={commandId:commandId(),type:"workflow.propose",requestId:rid,payload:body};await authorize(session,command);
        if(!(options.workflowProposalService instanceof CreatorWorkflowProposalService))throw new HttpError(503,"WORKFLOW_PROPOSALS_UNAVAILABLE","Este host não expõe planejamento estruturado de workflows");
        try{const proposal=await options.workflowProposalService.propose(body as any);sendJson(response,201,{format:"arca-creator-workflow-proposal-result-v1",proposal})}catch(error:any){throw new HttpError(400,"WORKFLOW_PROPOSAL_REJECTED",String(error?.message??error))}return
      }
      if(method==="POST"&&url.pathname==="/api/workflows/register"){
        const {session}=authenticate(request);const body=await readJson(request);const proposalIdValue=String(body.proposalId??"").trim();const command={commandId:commandId(),type:"workflow.register",payload:{proposalId:proposalIdValue,expectedPlanHash:body.expectedPlanHash,confirmRegistration:body.confirmRegistration===true}};await authorize(session,command);
        if(!(options.workflowProposalService instanceof CreatorWorkflowProposalService))throw new HttpError(503,"WORKFLOW_PROPOSALS_UNAVAILABLE","Este host não expõe planejamento estruturado de workflows");
        try{const proposal=await options.workflowProposalService.register(body as any);sendJson(response,200,{format:"arca-creator-workflow-registration-v1",proposal})}catch(error:any){throw new HttpError(409,"WORKFLOW_REGISTRATION_REJECTED",String(error?.message??error))}return
      }

      if(method==="POST"&&url.pathname==="/api/workflows/reason"){
        const {session}=authenticate(request);const body=await readJson(request);const proposalIdValue=String(body.proposalId??"").trim();const command={commandId:commandId(),type:"workflow.reason",payload:{proposalId:proposalIdValue,expectedPlanHash:body.expectedPlanHash,message:body.message}};await authorize(session,command);
        if(!(options.workflowReasoningService instanceof CreatorWorkflowReasoningService))throw new HttpError(503,"WORKFLOW_REASONING_UNAVAILABLE","Este host não expõe reasoning privado vinculado a workflows");
        try{const output=await options.workflowReasoningService.start({...body,session} as any);sendJson(response,200,{format:"arca-creator-workflow-reasoning-result-v1",requestId:output.requestId,status:output.state==="completed"?"completed":"pending",reasoningState:output.state,output})}catch(error:any){throw new HttpError(409,"WORKFLOW_REASONING_REJECTED",String(error?.message??error))}return
      }
      if(method==="GET"&&url.pathname==="/api/workflows/reason/status"){
        const {session}=authenticate(request);const rid=requiredRequestId(url.searchParams.get("requestId"));const command={commandId:commandId(),type:"workflow.read",requestId:rid,payload:{operation:"reasoning-status"}};await authorize(session,command);
        if(!(options.workflowReasoningService instanceof CreatorWorkflowReasoningService))throw new HttpError(503,"WORKFLOW_REASONING_UNAVAILABLE","Este host não expõe reasoning privado vinculado a workflows");
        try{const output=await options.workflowReasoningService.status({requestId:rid,session});sendJson(response,200,{format:"arca-creator-workflow-reasoning-status-v1",requestId:rid,status:output.state==="completed"?"completed":"pending",reasoningState:output.state,output})}catch(error:any){throw new HttpError(409,"WORKFLOW_REASONING_STATUS_REJECTED",String(error?.message??error))}return
      }
      if(method==="POST"&&url.pathname==="/api/workflows/reason/collect"){
        const {session}=authenticate(request);const body=await readJson(request);const rid=requiredRequestId(body.requestId);const command={commandId:commandId(),type:"workflow.reason",requestId:rid,payload:{operation:"collect"}};await authorize(session,command);
        if(!(options.workflowReasoningService instanceof CreatorWorkflowReasoningService))throw new HttpError(503,"WORKFLOW_REASONING_UNAVAILABLE","Este host não expõe reasoning privado vinculado a workflows");
        try{const output=await options.workflowReasoningService.collect({requestId:rid,session});sendJson(response,200,{format:"arca-creator-workflow-reasoning-result-v1",requestId:rid,status:output.state==="completed"?"completed":"pending",reasoningState:output.state,output})}catch(error:any){throw new HttpError(409,"WORKFLOW_REASONING_COLLECT_REJECTED",String(error?.message??error))}return
      }
      if(method==="GET"&&url.pathname==="/api/workflows/reason/pending"){
        const {session}=authenticate(request);const command={commandId:commandId(),type:"workflow.read",payload:{operation:"reasoning-pending"}};await authorize(session,command);
        if(!(options.workflowReasoningService instanceof CreatorWorkflowReasoningService))throw new HttpError(503,"WORKFLOW_REASONING_UNAVAILABLE","Este host não expõe reasoning privado vinculado a workflows");
        const output=await options.workflowReasoningService.list({session});sendJson(response,200,{format:"arca-creator-workflow-reasoning-pending-list-v1",output});return
      }

      if(method==="GET"&&url.pathname==="/api/reviews"){
        const {session}=authenticate(request);const requestedStatus=String(url.searchParams.get("status")??"pending").trim().toLowerCase();if(!["pending","resolved","dismissed","all"].includes(requestedStatus))throw new HttpError(400,"INVALID_REVIEW_STATUS","status de revisão inválido");
        const command={commandId:commandId(),type:"review.read",payload:{operation:"list",status:requestedStatus}};await authorize(session,command);
        const items=await reviews.list(requestedStatus==="all"?{}:{status:requestedStatus});sendJson(response,200,{format:"arca-creator-review-list-v1",items});return
      }
      if(method==="POST"&&url.pathname==="/api/reviews/resolve"){
        const {session}=authenticate(request);const body=await readJson(request);const reviewIdValue=String(body.reviewId??"").trim();if(!/^HRV-[a-f0-9-]{36}$/.test(reviewIdValue))throw new HttpError(400,"INVALID_REVIEW_ID","reviewId inválido");
        const current=await reviews.get(reviewIdValue);const sourceRequestId=typeof current.source?.requestId==="string"?current.source.requestId:null;
        const decision=String(body.decision??"").trim();if(!["approve","reject","acknowledge","needs-more-information"].includes(decision))throw new HttpError(400,"INVALID_REVIEW_DECISION","decisão de revisão inválida");
        const reason=String(body.reason??"").trim();if(!reason)throw new HttpError(400,"REVIEW_REASON_REQUIRED","Motivo da decisão é obrigatório");
        const expectedRecordHash=String(body.expectedRecordHash??"").trim();if(!/^[a-f0-9]{64}$/.test(expectedRecordHash))throw new HttpError(400,"INVALID_REVIEW_HASH","expectedRecordHash inválido");
        const command={commandId:commandId(),type:"review.decide",...(sourceRequestId?{requestId:sourceRequestId}:{}),payload:{reviewId:reviewIdValue,decision}};await authorize(session,command);
        const resolved=await reviews.resolve({reviewId:reviewIdValue,reviewerId:session.subject,decision:decision as any,reason,expectedRecordHash});
        const continuation=sourceRequestId?await reviewGate.reconcileRequest(sourceRequestId):null;
        sendJson(response,200,{format:"arca-creator-review-decision-v1",review:resolved,gate:continuation?.gate??null,continuationPointer:continuation?.pointer??null});return
      }
      if(method==="POST"&&url.pathname==="/api/chat"){
        const {session}=authenticate(request);const body=await readJson(request);const message=typeof body.message==="string"?body.message.trim():"";if(!message)throw new HttpError(400,"MESSAGE_REQUIRED","Mensagem obrigatória");if(message.length>16000)throw new HttpError(413,"MESSAGE_TOO_LARGE","Mensagem excede 16000 caracteres");const rid=requestId(body.requestId);
        const command={commandId:commandId(),type:"chat.send",requestId:rid,payload:{message}};await authorize(session,command);
        if(typeof options.chatHandler!=="function")throw new HttpError(503,"ARCA_PRIMARY_UNAVAILABLE","Nenhum provedor de raciocínio foi conectado ao arca-primary neste host");
        const output:any=await options.chatHandler({message,requestId:rid,session,context:{home}});const lifecycle=output&&typeof output==="object"&&typeof output.state==="string"?output.state:"completed";const status=lifecycle==="completed"?"completed":"pending";sendJson(response,200,{format:"arca-creator-chat-result-v1",requestId:rid,status,reasoningState:lifecycle,agent:"arca-primary",output,coreMutationPerformed:false});return
      }
      if(method==="GET"&&url.pathname==="/api/chat/status"){
        const {session}=authenticate(request);const rid=requiredRequestId(url.searchParams.get("requestId"));const command={commandId:commandId(),type:"state.read",requestId:rid,payload:{view:"chat-status"}};await authorize(session,command);
        if(typeof options.chatStatusHandler!=="function")throw new HttpError(503,"CHAT_STATUS_UNAVAILABLE","Este host não expõe status de chat assíncrono");
        const output:any=await options.chatStatusHandler({requestId:rid,session,context:{home}});const lifecycle=output&&typeof output==="object"&&typeof output.state==="string"?output.state:"unknown";sendJson(response,200,{format:"arca-creator-chat-status-v1",requestId:rid,status:lifecycle==="completed"?"completed":"pending",reasoningState:lifecycle,agent:"arca-primary",output,coreMutationPerformed:false});return
      }
      if(method==="POST"&&url.pathname==="/api/chat/collect"){
        const {session}=authenticate(request);const body=await readJson(request);const rid=requiredRequestId(body.requestId);const command={commandId:commandId(),type:"chat.send",requestId:rid,payload:{operation:"collect"}};await authorize(session,command);
        if(typeof options.chatCollectHandler!=="function")throw new HttpError(503,"CHAT_COLLECT_UNAVAILABLE","Este host não expõe coleta de chat assíncrono");
        const output:any=await options.chatCollectHandler({requestId:rid,session,context:{home}});const lifecycle=output&&typeof output==="object"&&typeof output.state==="string"?output.state:"completed";sendJson(response,200,{format:"arca-creator-chat-result-v1",requestId:rid,status:lifecycle==="completed"?"completed":"pending",reasoningState:lifecycle,agent:"arca-primary",output,coreMutationPerformed:false});return
      }
      if(method==="GET"&&url.pathname==="/api/chat/pending"){
        const {session}=authenticate(request);const command={commandId:commandId(),type:"state.read",payload:{view:"chat-pending"}};await authorize(session,command);
        if(typeof options.chatListHandler!=="function")throw new HttpError(503,"CHAT_PENDING_UNAVAILABLE","Este host não expõe fila de chat assíncrono");
        const output=await options.chatListHandler({session,context:{home}});sendJson(response,200,{format:"arca-creator-chat-pending-list-v1",agent:"arca-primary",output,coreMutationPerformed:false});return
      }

      if(method==="POST"&&url.pathname==="/api/passkeys/register/options"){
        requirePasskeyHost(hostHeader);requirePasskeyHeader(request);requireEnrollmentHeader(request);const {session}=authenticate(request);const body=await readJson(request);if(body.confirmFirstEnrollment!==true)throw new HttpError(400,"FIRST_PASSKEY_CONFIRMATION_REQUIRED","Confirmação explícita do primeiro enrollment é obrigatória");const registry=await ensureFirstEnrollmentSession(session);const issued=registry.issueRegistrationOptions();sendJson(response,200,{format:"arca-creator-passkey-registration-options-v1",challengeId:issued.challengeId,expiresAt:issued.expiresAt,publicKey:issued.publicKey});return
      }
      if(method==="POST"&&url.pathname==="/api/passkeys/register/verify"){
        requirePasskeyHost(hostHeader);requirePasskeyHeader(request);requireEnrollmentHeader(request);const {session}=authenticate(request);const body=await readJson(request);if(body.confirmFirstEnrollment!==true)throw new HttpError(400,"FIRST_PASSKEY_CONFIRMATION_REQUIRED","Confirmação explícita do primeiro enrollment é obrigatória");
        const record=await withEnrollmentLock(async()=>{const registry=await ensureFirstEnrollmentSession(session);try{return await registry.register({challengeId:body.challengeId,credential:body.credential,label:body.label})}catch(error:any){throw new HttpError(400,"PASSKEY_REGISTRATION_REJECTED",String(error?.message??error))}});const registry=await getPasskeys();const publicRecord=(await registry.publicList()).find(item=>item.credentialIdHash===record.credentialIdHash);sendJson(response,201,{format:"arca-creator-passkey-registration-v1",credential:publicRecord});return
      }
      if(method==="POST"&&url.pathname==="/api/passkeys/auth/options"){
        requirePasskeyHost(hostHeader);requirePasskeyHeader(request);await readJson(request);const registry=await getPasskeys();const active=(await registry.publicList()).filter(item=>!item.revokedAt);if(!active.length)throw new HttpError(409,"PASSKEY_NOT_ENROLLED","Nenhuma passkey ativa foi cadastrada");const issued=await registry.issueAuthenticationOptions({purpose:"authenticate"});sendJson(response,200,{format:"arca-creator-passkey-auth-options-v1",challengeId:issued.challengeId,expiresAt:issued.expiresAt,publicKey:issued.publicKey});return
      }
      if(method==="POST"&&url.pathname==="/api/passkeys/auth/verify"){
        requirePasskeyHost(hostHeader);requirePasskeyHeader(request);const body=await readJson(request);const registry=await getPasskeys();let verified;try{verified=await registry.verifyAssertion({challengeId:body.challengeId,credential:body.credential},{purpose:"authenticate"})}catch(error:any){throw new HttpError(401,"PASSKEY_AUTH_REJECTED",String(error?.message??error))}const grant=sessions.issueAuthenticatedSession({credentialIdHash:verified.credentialIdHash,authMethod:"webauthn"});sendJson(response,200,{format:"arca-creator-passkey-grant-v1",token:grant.token,session:publicSession(grant.session)});return
      }
      if(method==="POST"&&url.pathname==="/api/passkeys/step-up/options"){
        requirePasskeyHost(hostHeader);requirePasskeyHeader(request);const {session}=authenticate(request);await readJson(request);if(!strongSession(session))throw new HttpError(403,"STRONG_SESSION_REQUIRED","Step-up exige sessão WebAuthn/hardware-key");const registry=await getPasskeys();const issued=await registry.issueAuthenticationOptions({purpose:"step-up"});sendJson(response,200,{format:"arca-creator-passkey-step-up-options-v1",challengeId:issued.challengeId,expiresAt:issued.expiresAt,publicKey:issued.publicKey});return
      }
      if(method==="POST"&&url.pathname==="/api/passkeys/step-up/verify"){
        requirePasskeyHost(hostHeader);requirePasskeyHeader(request);const {token,session}=authenticate(request);if(!strongSession(session))throw new HttpError(403,"STRONG_SESSION_REQUIRED","Step-up exige sessão WebAuthn/hardware-key");const body=await readJson(request);const registry=await getPasskeys();let verified;try{verified=await registry.verifyAssertion({challengeId:body.challengeId,credential:body.credential},{purpose:"step-up"})}catch(error:any){throw new HttpError(401,"PASSKEY_STEP_UP_REJECTED",String(error?.message??error))}let updated;try{updated=sessions.markStepUp(token,{credentialIdHash:verified.credentialIdHash})}catch(error:any){throw new HttpError(403,"PASSKEY_STEP_UP_SESSION_MISMATCH",String(error?.message??error))}sendJson(response,200,{format:"arca-creator-passkey-step-up-v1",session:publicSession(updated)});return
      }

      const staticFile=STATIC_FILES[url.pathname];if(method==="GET"&&staticFile){const body=await readFile(join(PUBLIC_ROOT,staticFile.file),"utf8");sendText(response,200,body,staticFile.type);return}
      throw new HttpError(404,"NOT_FOUND","Rota não encontrada");
    }catch(error:any){const status=error instanceof HttpError?error.status:500;const code=error instanceof HttpError?error.code:"CREATOR_CONSOLE_ERROR";sendJson(response,status,{error:{code,message:String(error?.message??error)}})}
  });

  return Object.freeze({
    reviews,
    async start(){await initAudit();bootstrap=sessions.issueBootstrap();await new Promise<void>((resolveStart,reject)=>{server.once("error",reject);server.listen(port,host,()=>{server.off("error",reject);resolveStart()})});const address=server.address();if(!address||typeof address==="string")throw new Error("endereço Creator Console indisponível");const printableHost=address.family==="IPv6"?`[${address.address}]`:address.address;return {url:`http://${printableHost}:${address.port}`,passkeyUrl:`http://localhost:${address.port}`,host:address.address,port:address.port,bootstrap:{...bootstrap}}},
    async stop(){sessions.clear();if(!server.listening)return;await new Promise<void>((resolveStop,reject)=>server.close(error=>error?reject(error):resolveStop()))},
    rotateBootstrap(){bootstrap=sessions.issueBootstrap();return {...bootstrap}},
    getBootstrap(){return bootstrap?{...bootstrap}:null}
  });
}
