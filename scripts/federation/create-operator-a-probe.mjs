import {createHash,createPublicKey,sign} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import {randomBytes} from "node:crypto";

const DOMAIN="arca.machine-bridge.federation-probe.v1";
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v}
const stringify=v=>JSON.stringify(stable(v));
const sha=v=>createHash("sha256").update(typeof v==="string"?v:stringify(v)).digest("hex");

const keyPath=process.env.ARCA_FEDERATION_A_PRIVATE_KEY;
const out=process.argv[2];
if(!keyPath||!out)throw new Error("uso: ARCA_FEDERATION_A_PRIVATE_KEY=<arquivo> node ... <saida.json>");
const privateKey=await readFile(keyPath,"utf8");
const publicKey=createPublicKey(privateKey);
if(publicKey.asymmetricKeyType!=="ed25519")throw new Error("a identidade federada exige Ed25519");
const der=Buffer.from(publicKey.export({type:"spki",format:"der"}));
const identity={operatorId:"arca-federation-operator-a",algorithm:"Ed25519",keyFingerprint:sha(der.toString("base64")),publicKeySpki:der.toString("base64")};
const id=process.env.ARCA_FEDERATION_REQUEST_ID||("fed-"+Date.now());
const payload={format:"arca-federation-probe-v1",protocolVersion:3,requestId:id,jobId:id+"-job",originOperatorId:identity.operatorId,targetOperatorId:"arca-federation-operator-b",action:"worker.ping",params:{echo:"ARCA A -> B"}};
const now=new Date(),expires=new Date(now.getTime()+60000);
const body={format:"arca-federation-signed-probe-v1",domain:DOMAIN,signer:identity,nonce:randomBytes(18).toString("base64url"),issuedAt:now.toISOString(),expiresAt:expires.toISOString(),payloadHash:sha(payload),payload};
const statement={...body,signature:sign(null,Buffer.from("ARCA-FEDERATION-PROBE\0"+stringify(body)),privateKey).toString("base64url")};
await writeFile(out,JSON.stringify(statement,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({requestId:id,keyFingerprint:identity.keyFingerprint,out}));
