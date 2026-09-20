import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,randomBytes,sign} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CreatorPasskeyRegistry,CreatorSessionStore,authorizeCreatorCommand} from "../packages/agent/src/index.ts";

function b64(value){return Buffer.from(value).toString("base64url")}
function unb64(value){return Buffer.from(value,"base64url")}
function sha(value){return createHash("sha256").update(value).digest()}
function cborHead(major,length){if(length<24)return Buffer.from([(major<<5)|length]);if(length<=0xff)return Buffer.from([(major<<5)|24,length]);if(length<=0xffff){const out=Buffer.alloc(3);out[0]=(major<<5)|25;out.writeUInt16BE(length,1);return out}const out=Buffer.alloc(5);out[0]=(major<<5)|26;out.writeUInt32BE(length,1);return out}
function cbor(value){
  if(Buffer.isBuffer(value)){return Buffer.concat([cborHead(2,value.length),value])}
  if(typeof value==="string"){const raw=Buffer.from(value);return Buffer.concat([cborHead(3,raw.length),raw])}
  if(Number.isInteger(value)){if(value>=0)return cborHead(0,value);return cborHead(1,-1-value)}
  if(value instanceof Map){const chunks=[cborHead(5,value.size)];for(const [key,item] of value){chunks.push(cbor(key),cbor(item))}return Buffer.concat(chunks)}
  if(Array.isArray(value)){return Buffer.concat([cborHead(4,value.length),...value.map(cbor)])}
  throw new Error(`unsupported CBOR test value: ${typeof value}`);
}
function counter(value){const out=Buffer.alloc(4);out.writeUInt32BE(value);return out}
function registrationFixture({challenge,origin="http://localhost:4318",rpId="localhost",signCount=0}={}){
  const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"P-256"});const jwk=publicKey.export({format:"jwk"});const credentialId=randomBytes(32);const aaguid=Buffer.alloc(16);const credentialLength=Buffer.alloc(2);credentialLength.writeUInt16BE(credentialId.length);
  const cose=new Map([[1,2],[3,-7],[-1,1],[-2,unb64(jwk.x)],[-3,unb64(jwk.y)]]);const authData=Buffer.concat([sha(rpId),Buffer.from([0x45]),counter(signCount),aaguid,credentialLength,credentialId,cbor(cose)]);const attestation=cbor(new Map([["fmt","none"],["attStmt",new Map()],["authData",authData]]));const clientData=Buffer.from(JSON.stringify({type:"webauthn.create",challenge,origin,crossOrigin:false}));
  return {publicKey,privateKey,credentialId:b64(credentialId),credential:{id:b64(credentialId),type:"public-key",response:{clientDataJSON:b64(clientData),attestationObject:b64(attestation)}}};
}
function assertionFixture({challenge,credentialId,privateKey,origin="http://localhost:4318",rpId="localhost",signCount=1}={}){
  const clientData=Buffer.from(JSON.stringify({type:"webauthn.get",challenge,origin,crossOrigin:false}));const authData=Buffer.concat([sha(rpId),Buffer.from([0x05]),counter(signCount)]);const signed=Buffer.concat([authData,sha(clientData)]);const signature=sign("sha256",signed,privateKey);return {id:credentialId,type:"public-key",response:{clientDataJSON:b64(clientData),authenticatorData:b64(authData),signature:b64(signature)}};
}
async function fixture(t){const home=await mkdtemp(join(tmpdir(),"arca-passkey-"));t.after(()=>rm(home,{recursive:true,force:true}));const registry=new CreatorPasskeyRegistry(home,{rpId:"localhost",allowedOrigins:["http://localhost:4318"],challengeTtlMs:60_000});return {home,registry}}

test("passkey registration verifies challenge, origin, RP hash, UV and fmt=none",async(t)=>{
  const {registry}=await fixture(t);const options=registry.issueRegistrationOptions();const f=registrationFixture({challenge:options.challenge});const record=await registry.register({challengeId:options.challengeId,credential:f.credential,label:"telefone principal"});
  assert.equal(record.credentialId,f.credentialId);assert.equal(record.algorithm,"ES256");assert.match(record.credentialIdHash,/^[a-f0-9]{64}$/);assert.equal(record.label,"telefone principal");assert.equal(record.revokedAt,null);
  const publicList=await registry.publicList();assert.equal(publicList.length,1);assert.equal(publicList[0].credentialId,f.credentialId);assert.equal(Object.hasOwn(publicList[0],"publicKeyJwk"),false);
  await assert.rejects(()=>registry.register({challengeId:options.challengeId,credential:f.credential}),/challenge WebAuthn inexistente/);
});

test("passkey assertion verifies signature and consumes challenge exactly once",async(t)=>{
  const {registry}=await fixture(t);const create=registry.issueRegistrationOptions();const f=registrationFixture({challenge:create.challenge});await registry.register({challengeId:create.challengeId,credential:f.credential});const auth=await registry.issueAuthenticationOptions();const credential=assertionFixture({challenge:auth.challenge,credentialId:f.credentialId,privateKey:f.privateKey,signCount:1});const verified=await registry.verifyAssertion({challengeId:auth.challengeId,credential});
  assert.equal(verified.format,"arca-creator-passkey-assertion-v1");assert.equal(verified.purpose,"authenticate");assert.equal(verified.userVerified,true);assert.match(verified.credentialIdHash,/^[a-f0-9]{64}$/);
  await assert.rejects(()=>registry.verifyAssertion({challengeId:auth.challengeId,credential}),/challenge WebAuthn inexistente/);
});

test("origin mismatch and non-monotonic sign counter fail closed",async(t)=>{
  const {registry}=await fixture(t);const create=registry.issueRegistrationOptions();const f=registrationFixture({challenge:create.challenge});await registry.register({challengeId:create.challengeId,credential:f.credential});
  const badOrigin=await registry.issueAuthenticationOptions();const bad=assertionFixture({challenge:badOrigin.challenge,credentialId:f.credentialId,privateKey:f.privateKey,origin:"http://127.0.0.1:4318",signCount:1});await assert.rejects(()=>registry.verifyAssertion({challengeId:badOrigin.challengeId,credential:bad}),/origin nao autorizado/);
  const first=await registry.issueAuthenticationOptions();await registry.verifyAssertion({challengeId:first.challengeId,credential:assertionFixture({challenge:first.challenge,credentialId:f.credentialId,privateKey:f.privateKey,signCount:1})});const replayCounter=await registry.issueAuthenticationOptions();await assert.rejects(()=>registry.verifyAssertion({challengeId:replayCounter.challengeId,credential:assertionFixture({challenge:replayCounter.challenge,credentialId:f.credentialId,privateKey:f.privateKey,signCount:1})}),/contador WebAuthn nao monotono/);
});

test("revoked passkey cannot authenticate",async(t)=>{
  const {registry}=await fixture(t);const create=registry.issueRegistrationOptions();const f=registrationFixture({challenge:create.challenge});const record=await registry.register({challengeId:create.challengeId,credential:f.credential});const revoked=await registry.revoke({credentialId:f.credentialId,reason:"dispositivo perdido",expectedRecordHash:record.recordHash});assert.ok(revoked.revokedAt);const auth=await registry.issueAuthenticationOptions();assert.equal(auth.publicKey.allowCredentials.length,0);const credential=assertionFixture({challenge:auth.challenge,credentialId:f.credentialId,privateKey:f.privateKey,signCount:1});await assert.rejects(()=>registry.verifyAssertion({challengeId:auth.challengeId,credential}),/passkey revogada/);
});

test("strong Creator session can receive full scopes but high-risk command still needs fresh step-up",()=>{
  const sessions=new CreatorSessionStore({sessionTtlMs:60_000});const credentialIdHash="a".repeat(64);const grant=sessions.issueAuthenticatedSession({credentialIdHash});assert.equal(grant.session.authMethod,"webauthn");assert.ok(grant.session.scopes.includes("creator.authorize-network"));assert.equal(grant.session.stepUpAt,undefined);
  const command={commandId:"cmd-network-1",type:"network.authorize",confirmationId:"confirm-network-1",payload:{target:"pncp-public"}};const before=authorizeCreatorCommand(grant.session,command);assert.equal(before.allowed,false);assert.match(before.reason,/step-up/);
  const stepped=sessions.markStepUp(grant.token,{credentialIdHash});assert.ok(stepped.stepUpAt);const after=authorizeCreatorCommand(stepped,command);assert.equal(after.allowed,true);
  assert.throws(()=>sessions.markStepUp(grant.token,{credentialIdHash:"b".repeat(64)}),/credential divergente/);
});

test("local bootstrap remains low privilege and cannot be promoted into passkey step-up",()=>{
  const sessions=new CreatorSessionStore({bootstrapTtlMs:60_000,sessionTtlMs:60_000});const bootstrap=sessions.issueBootstrap();const grant=sessions.exchangeBootstrap(bootstrap.code);assert.deepEqual(grant.session.scopes,["creator.chat","creator.read"]);assert.throws(()=>sessions.markStepUp(grant.token,{credentialIdHash:grant.session.credentialIdHash}),/autenticacao forte/);
});
