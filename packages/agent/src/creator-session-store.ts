import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {CREATOR_SCOPES,normalizeCreatorSession,type CreatorAuthMethod,type CreatorSession,type CreatorScope} from "./creator-control.ts";

const DEFAULT_BOOTSTRAP_TTL_MS=5*60*1000;
const DEFAULT_SESSION_TTL_MS=15*60*1000;
const LOCAL_SCOPES=Object.freeze(["creator.chat","creator.read"] as CreatorScope[]);
const HASH=/^[a-f0-9]{64}$/;

function sha256(value:string){return createHash("sha256").update(value).digest("hex")}
function randomToken(bytes=32){return randomBytes(bytes).toString("base64url")}
function constantEqual(a:string,b:string){
  const left=Buffer.from(a);const right=Buffer.from(b);
  return left.length===right.length&&timingSafeEqual(left,right);
}
function validTtl(value:number,label:string,max:number){if(!Number.isSafeInteger(value)||value<1000||value>max)throw new RangeError(`${label} invalido`);return value}

export type CreatorBootstrap={code:string;expiresAt:string};
export type CreatorSessionGrant={token:string;session:CreatorSession};

export class CreatorSessionStore{
  #bootstrapHash:string|null=null;
  #bootstrapExpiresAt=0;
  #sessions=new Map<string,CreatorSession>();
  readonly bootstrapTtlMs:number;
  readonly sessionTtlMs:number;

  constructor({bootstrapTtlMs=DEFAULT_BOOTSTRAP_TTL_MS,sessionTtlMs=DEFAULT_SESSION_TTL_MS}:{bootstrapTtlMs?:number;sessionTtlMs?:number}={}){
    this.bootstrapTtlMs=validTtl(bootstrapTtlMs,"bootstrapTtlMs",15*60*1000);
    this.sessionTtlMs=validTtl(sessionTtlMs,"sessionTtlMs",60*60*1000);
  }

  private issueSession({authMethod,credentialIdHash,scopes,subject="creator:primary",now=new Date()}:{authMethod:CreatorAuthMethod;credentialIdHash:string;scopes:CreatorScope[];subject?:string;now?:Date}):CreatorSessionGrant{
    if(!HASH.test(String(credentialIdHash??"")))throw new Error("credentialIdHash invalido");
    const token=randomToken(32);const tokenHash=sha256(token);const issuedAt=now.toISOString();const expiresAt=new Date(now.getTime()+this.sessionTtlMs).toISOString();
    const session=normalizeCreatorSession({format:"arca-creator-session-v1",sessionId:`creator-${randomToken(12)}`,subject,scopes:[...scopes],authMethod,credentialIdHash,issuedAt,expiresAt});
    this.#sessions.set(tokenHash,session);return {token,session};
  }

  issueBootstrap({now=new Date()}:{now?:Date}={}):CreatorBootstrap{
    const code=randomToken(24);
    this.#bootstrapHash=sha256(code);
    this.#bootstrapExpiresAt=now.getTime()+this.bootstrapTtlMs;
    return {code,expiresAt:new Date(this.#bootstrapExpiresAt).toISOString()};
  }

  exchangeBootstrap(code:string,{now=new Date(),subject="creator:primary"}:{now?:Date;subject?:string}={}):CreatorSessionGrant{
    if(typeof code!=="string"||!code||!this.#bootstrapHash)throw new Error("creator bootstrap invalido");
    if(now.getTime()>=this.#bootstrapExpiresAt){this.#bootstrapHash=null;throw new Error("creator bootstrap expirado")}
    const supplied=sha256(code);
    if(!constantEqual(supplied,this.#bootstrapHash))throw new Error("creator bootstrap invalido");
    this.#bootstrapHash=null;
    return this.issueSession({authMethod:"local-bootstrap",credentialIdHash:sha256(`local:${supplied}`),scopes:[...LOCAL_SCOPES],subject,now});
  }

  issueAuthenticatedSession({credentialIdHash,scopes=[...CREATOR_SCOPES],subject="creator:primary",authMethod="webauthn",now=new Date()}:{credentialIdHash:string;scopes?:CreatorScope[];subject?:string;authMethod?:"webauthn"|"hardware-key";now?:Date}):CreatorSessionGrant{
    if(authMethod!=="webauthn"&&authMethod!=="hardware-key")throw new Error("authMethod forte invalido");
    return this.issueSession({authMethod,credentialIdHash,scopes,subject,now});
  }

  resolve(token:string,{now=new Date()}:{now?:Date}={}):CreatorSession|null{
    if(typeof token!=="string"||!token)return null;
    const hash=sha256(token);const session=this.#sessions.get(hash);if(!session)return null;
    if(now.getTime()>=Date.parse(session.expiresAt)){this.#sessions.delete(hash);return null}
    return normalizeCreatorSession(session);
  }

  markStepUp(token:string,{credentialIdHash,now=new Date()}:{credentialIdHash:string;now?:Date}):CreatorSession{
    if(!HASH.test(String(credentialIdHash??"")))throw new Error("credentialIdHash invalido");const tokenHash=sha256(token);const current=this.resolve(token,{now});if(!current)throw new Error("creator session invalida ou expirada");
    if(current.authMethod!=="webauthn"&&current.authMethod!=="hardware-key")throw new Error("step-up exige autenticacao forte");
    if(current.credentialIdHash!==credentialIdHash)throw new Error("step-up credential divergente da sessao");
    const updated=normalizeCreatorSession({...current,stepUpAt:now.toISOString()});this.#sessions.set(tokenHash,updated);return updated;
  }

  revoke(token:string):boolean{
    if(typeof token!=="string"||!token)return false;
    return this.#sessions.delete(sha256(token));
  }

  clear(){this.#sessions.clear();this.#bootstrapHash=null;this.#bootstrapExpiresAt=0}
}
