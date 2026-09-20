import {createCipheriv,createDecipheriv,createHash,randomBytes,scryptSync} from "node:crypto";
import {mkdir,readFile,readdir,rename,writeFile,appendFile,rm} from "node:fs/promises";
import {join} from "node:path";

export const ARCA_ENCRYPTED_CREDENTIAL_FORMAT="arca-encrypted-credential-v1";
export const ARCA_CREDENTIAL_AUDIT_FORMAT="arca-credential-audit-v1";
export const ARCA_CREDENTIAL_SECURITY_NOTICE_FORMAT="arca-credential-security-notice-v1";

const REF=/^[A-Za-z0-9._:/-]{3,200}$/;
const ALGORITHM="aes-256-gcm";
const KDF="scrypt";

function sha256(value){return createHash("sha256").update(value).digest("hex")}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function canonical(value){
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function nowIso(clock){return (clock?.()??new Date()).toISOString()}
function validateRef(ref){const value=String(ref??"").trim();if(!REF.test(value))throw new TypeError("credentialRef invalido");return value}
function secretBuffer(secret){
  if(secret instanceof Uint8Array)return Buffer.from(secret);
  if(typeof secret==="string"&&secret.length>0)return Buffer.from(secret,"utf8");
  throw new TypeError("credencial vazia ou invalida");
}
function publicMetadata(record){
  return Object.freeze({format:record.format,credentialRef:record.credentialRef,createdAt:record.createdAt,updatedAt:record.updatedAt,algorithm:record.algorithm,kdf:record.kdf,ciphertextSha256:record.ciphertextSha256,recordHash:record.recordHash,metadata:clone(record.metadata??{})});
}
function recordBase(record){const {recordHash,...base}=record;return base}
function validateRecord(record){
  if(!record||typeof record!=="object"||record.format!==ARCA_ENCRYPTED_CREDENTIAL_FORMAT)throw new Error("registro de credencial cifrada invalido");
  validateRef(record.credentialRef);
  if(record.algorithm!==ALGORITHM||record.kdf!==KDF)throw new Error("algoritmo de credencial nao suportado");
  for(const field of ["salt","iv","tag","ciphertext","ciphertextSha256","recordHash"])if(typeof record[field]!=="string"||!record[field])throw new Error(`campo criptografico ausente: ${field}`);
  const ciphertext=Buffer.from(record.ciphertext,"base64");
  if(sha256(ciphertext)!==record.ciphertextSha256)throw new Error("hash do ciphertext divergente");
  if(sha256(canonical(recordBase(record)))!==record.recordHash)throw new Error("recordHash divergente");
  return record;
}
function deriveKey(passphrase,salt){
  const source=secretBuffer(passphrase);
  try{return scryptSync(source,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024})}finally{source.fill(0)}
}
function eventBase(event){const {eventHash,...base}=event;return base}
function validateAuditEvents(events){
  let previous=null;
  for(let i=0;i<events.length;i+=1){
    const event=events[i];
    if(event?.format!==ARCA_CREDENTIAL_AUDIT_FORMAT)throw new Error(`evento de auditoria invalido na posicao ${i}`);
    if(event.sequence!==i+1)throw new Error(`sequencia de auditoria invalida na posicao ${i}`);
    if(event.previousEventHash!==previous)throw new Error(`encadeamento de auditoria invalido na posicao ${i}`);
    const expected=sha256(canonical(eventBase(event)));if(event.eventHash!==expected)throw new Error(`hash de auditoria invalido na posicao ${i}`);
    previous=event.eventHash;
  }
  return {valid:true,eventCount:events.length,eventHead:previous};
}

export function createMemoryCredentialStore(){
  const records=new Map();const audit=[];
  return {
    async putCredential(ref,record){records.set(ref,clone(record))},
    async getCredential(ref){return records.has(ref)?clone(records.get(ref)):null},
    async deleteCredential(ref){records.delete(ref)},
    async listCredentialRecords(){return [...records.values()].map(clone)},
    async appendAuditEvent(event){audit.push(clone(event))},
    async listAuditEvents(){return audit.map(clone)}
  };
}

export function createFilesystemCredentialStore(root){
  const home=String(root??"").trim();if(!home)throw new TypeError("credential store root obrigatorio");
  const recordsDir=join(home,"records");const auditPath=join(home,"audit.ndjson");
  const init=async()=>{await mkdir(recordsDir,{recursive:true,mode:0o700});await mkdir(home,{recursive:true,mode:0o700})};
  const fileFor=ref=>join(recordsDir,`${sha256(validateRef(ref))}.json`);
  return {
    async putCredential(ref,record){await init();const path=fileFor(ref);const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;await writeFile(tmp,JSON.stringify(record,null,2),{mode:0o600});await rename(tmp,path)},
    async getCredential(ref){await init();try{return JSON.parse(await readFile(fileFor(ref),"utf8"))}catch(error){if(error?.code==="ENOENT")return null;throw error}},
    async deleteCredential(ref){await init();await rm(fileFor(ref),{force:true})},
    async listCredentialRecords(){await init();const out=[];for(const name of await readdir(recordsDir)){if(!name.endsWith(".json"))continue;out.push(JSON.parse(await readFile(join(recordsDir,name),"utf8")))}return out},
    async appendAuditEvent(event){await init();await appendFile(auditPath,`${JSON.stringify(event)}\n`,{mode:0o600})},
    async listAuditEvents(){await init();try{return (await readFile(auditPath,"utf8")).split("\n").filter(Boolean).map(line=>JSON.parse(line))}catch(error){if(error?.code==="ENOENT")return [];throw error}}
  };
}

export class EncryptedCredentialVault{
  constructor({store,keyProvider,clock=()=>new Date()}={}){
    if(!store||typeof store.putCredential!=="function"||typeof store.getCredential!=="function"||typeof store.appendAuditEvent!=="function")throw new TypeError("credential store invalido");
    if(typeof keyProvider!=="function")throw new TypeError("keyProvider obrigatorio");
    this.store=store;this.keyProvider=keyProvider;this.clock=clock;
  }
  async #audit(operation,credentialRef,details={}){
    const events=await this.store.listAuditEvents();const verified=validateAuditEvents(events);const event={format:ARCA_CREDENTIAL_AUDIT_FORMAT,sequence:events.length+1,at:nowIso(this.clock),operation,credentialRef,details:clone(details),previousEventHash:verified.eventHead};event.eventHash=sha256(canonical(event));await this.store.appendAuditEvent(event);return clone(event);
  }
  async storeCredential(credentialRef,secret,metadata={}){
    const ref=validateRef(credentialRef);const plain=secretBuffer(secret);const passphrase=await this.keyProvider({operation:"encrypt",credentialRef:ref});const salt=randomBytes(16),iv=randomBytes(12);const key=deriveKey(passphrase,salt);let ciphertext,tag;
    try{const cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(ref,"utf8"));ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);tag=cipher.getAuthTag()}finally{plain.fill(0);key.fill(0)}
    const existing=await this.store.getCredential(ref);const record={format:ARCA_ENCRYPTED_CREDENTIAL_FORMAT,credentialRef:ref,createdAt:existing?.createdAt??nowIso(this.clock),updatedAt:nowIso(this.clock),algorithm:ALGORITHM,kdf:KDF,salt:salt.toString("base64"),iv:iv.toString("base64"),tag:tag.toString("base64"),ciphertext:ciphertext.toString("base64"),ciphertextSha256:sha256(ciphertext),metadata:clone(metadata??{})};record.recordHash=sha256(canonical(record));await this.store.putCredential(ref,record);await this.#audit(existing?"credential.rotated":"credential.stored",ref,{ciphertextSha256:record.ciphertextSha256,recordHash:record.recordHash});return publicMetadata(record);
  }
  async listCredentials(){const records=await this.store.listCredentialRecords();return records.map(validateRecord).map(publicMetadata)}
  async auditCredential(credentialRef){const ref=validateRef(credentialRef);const record=await this.store.getCredential(ref);if(!record)return null;validateRecord(record);const events=(await this.store.listAuditEvents()).filter(event=>event.credentialRef===ref);return {credential:publicMetadata(record),auditEvents:events.map(clone),auditTrail:validateAuditEvents(await this.store.listAuditEvents())}}
  async deleteCredential(credentialRef){const ref=validateRef(credentialRef);const exists=await this.store.getCredential(ref);if(!exists)return false;await this.store.deleteCredential(ref);await this.#audit("credential.deleted",ref,{});return true}
  async withCredential(credentialRef,purpose,consumer){
    const ref=validateRef(credentialRef);if(typeof consumer!=="function")throw new TypeError("consumer obrigatorio");const record=validateRecord(await this.store.getCredential(ref));if(!record)throw new Error(`credencial nao encontrada: ${ref}`);const passphrase=await this.keyProvider({operation:"decrypt",credentialRef:ref,purpose:String(purpose??"")});const salt=Buffer.from(record.salt,"base64"),iv=Buffer.from(record.iv,"base64"),tag=Buffer.from(record.tag,"base64"),ciphertext=Buffer.from(record.ciphertext,"base64"),key=deriveKey(passphrase,salt);let plain;
    try{const decipher=createDecipheriv("aes-256-gcm",key,iv);decipher.setAAD(Buffer.from(ref,"utf8"));decipher.setAuthTag(tag);plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);await this.#audit("credential.used",ref,{purpose:String(purpose??"").slice(0,160)});return await consumer(plain)}finally{key.fill(0);plain?.fill(0)}
  }
  async verifyAuditTrail(){return validateAuditEvents(await this.store.listAuditEvents())}
}

export function createCredentialBroker(vault,{fetchImpl=globalThis.fetch}={}){
  if(!(vault instanceof EncryptedCredentialVault))throw new TypeError("EncryptedCredentialVault obrigatorio");if(typeof fetchImpl!=="function")throw new TypeError("fetch indisponivel");
  return Object.freeze({
    async authorizedFetch({auth,url,init={}}){
      if(!auth||auth.mode==="none")return fetchImpl(url,init);
      if(!auth.credentialRef)throw new Error("credentialRef obrigatorio");
      return vault.withCredential(auth.credentialRef,`http:${new URL(url).origin}`,async secretBytes=>{
        const secret=secretBytes.toString("utf8");const headers={...(init.headers??{})};if(auth.mode==="api-key")headers[auth.headerName??"X-API-Key"]=secret;else headers.Authorization=`Bearer ${secret}`;return fetchImpl(url,{...init,headers});
      });
    }
  });
}

export function getCredentialSecurityNotice(){
  return Object.freeze({
    format:ARCA_CREDENTIAL_SECURITY_NOTICE_FORMAT,
    title:"Como o ARCA protege suas credenciais",
    summary:"O ARCA Agent e o Core nao precisam receber nem armazenar sua chave em texto. Em uma instalacao segura, a credencial fica cifrada no cofre do host e e liberada apenas dentro do broker de transporte pelo tempo necessario para autenticar a requisicao.",
    guarantees:[
      "Credenciais persistidas devem usar criptografia autenticada AES-256-GCM.",
      "A chave mestra ou frase secreta nao e persistida pelo cofre; ela vem de um keyProvider controlado pelo host/usuario.",
      "Registry, jobs, resultados, relatorios e listagens publicas carregam apenas credentialRef e metadados nao secretos.",
      "O Agent Gateway pode usar um Credential Broker para que o segredo nao seja retornado ao ARCA Agent nem ao Core.",
      "Uso, rotacao e exclusao geram eventos de auditoria encadeados por SHA-256 sem registrar o valor da credencial.",
      "O usuario pode verificar hashes, algoritmo, integridade do registro cifrado e continuidade da trilha de auditoria sem revelar a chave."
    ],
    limitations:[
      "Nenhum sistema que use uma API key pode afirmar honestamente que o segredo nunca existe em memoria: o componente de transporte precisa apresenta-lo ao provedor no momento da requisicao.",
      "Um invasor que controle o dispositivo, o processo ou a memoria durante o uso pode superar protecoes de armazenamento; por isso o host e a chave mestra continuam parte do modelo de seguranca.",
      "Auditoria de codigo-fonte e testes verificam o comportamento do software publicado; para garantia forte de distribuicao, o binario/pacote executado tambem deve ser reproduzivel e verificavel por hash."
    ],
    userAudit:[
      "Inspecionar o codigo-fonte do Credential Vault e do Agent Gateway.",
      "Executar os testes de seguranca e verificar que nenhum segredo aparece em descriptors, jobs ou resultados.",
      "Comparar recordHash e ciphertextSha256 do cofre.",
      "Verificar a cadeia previousEventHash/eventHash do log de auditoria.",
      "Confirmar que a chave mestra esta fora do repositorio e do armazenamento cifrado."
    ]
  });
}
