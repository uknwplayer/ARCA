import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createPrivateNormalizationReader} from "../src/investigation/m5-private-normalization-reader.mjs";

const sha256=v=>createHash("sha256").update(v).digest("hex");
const response=(status,body)=>({
  ok:status>=200&&status<300,
  status,
  async text(){return JSON.stringify(body)}
});

test("M5-L reader fetches only encrypted envelope from private vault and verifies hash",async()=>{
  const envelope={
    schema:"arca.encrypted-custody-envelope.v0.1",
    status:"SEALED",
    algorithm:"AES-256-GCM",
    plaintextIncluded:false,
    contentRootHash:"1".repeat(64)
  };
  const expected=sha256(JSON.stringify(envelope));
  const path="derived/m5-h/aa/"+"a".repeat(64)+".envelope.json";
  const seen=[];
  const fetchImpl=async(url,options={})=>{
    seen.push({url,method:options.method});
    const u=new URL(url);
    if(u.pathname==="/repos/owner/private-vault")
      return response(200,{private:true,archived:false});
    if(u.pathname.includes("/contents/"))
      return response(200,{
        type:"file",
        encoding:"base64",
        content:Buffer.from(JSON.stringify(envelope)+"\n").toString("base64")
      });
    return response(404,{message:"unexpected"});
  };
  const reader=createPrivateNormalizationReader({
    repository:"owner/private-vault",
    targetBranch:"main",
    githubToken:"synthetic-private-token-0123456789",
    fetchImpl
  });
  const result=await reader.readEnvelope({path,expectedEnvelopeSha256:expected});
  assert.equal(result.envelopeSha256,expected);
  assert.deepEqual(result.envelope,envelope);
  assert.equal(seen.length,2);
});

test("M5-L reader fails closed on public vault or envelope hash mismatch",async()=>{
  let calls=0;
  const publicReader=createPrivateNormalizationReader({
    repository:"owner/private-vault",
    targetBranch:"main",
    githubToken:"synthetic-private-token-0123456789",
    fetchImpl:async()=>{
      calls++;
      return response(200,{private:false,archived:false});
    }
  });
  await assert.rejects(()=>publicReader.readEnvelope({
    path:"derived/m5-h/aa/"+"a".repeat(64)+".envelope.json",
    expectedEnvelopeSha256:"b".repeat(64)
  }),/VAULT_NOT_PRIVATE/);
  assert.equal(calls,1);

  const envelope={
    schema:"arca.encrypted-custody-envelope.v0.1",
    status:"SEALED",
    algorithm:"AES-256-GCM",
    plaintextIncluded:false,
    contentRootHash:"1".repeat(64)
  };
  const mismatchReader=createPrivateNormalizationReader({
    repository:"owner/private-vault",
    targetBranch:"main",
    githubToken:"synthetic-private-token-0123456789",
    fetchImpl:async(url)=>{
      const u=new URL(url);
      if(u.pathname==="/repos/owner/private-vault")
        return response(200,{private:true,archived:false});
      return response(200,{
        type:"file",encoding:"base64",
        content:Buffer.from(JSON.stringify(envelope)).toString("base64")
      });
    }
  });
  await assert.rejects(()=>mismatchReader.readEnvelope({
    path:"derived/m5-h/aa/"+"a".repeat(64)+".envelope.json",
    expectedEnvelopeSha256:"b".repeat(64)
  }),/ENVELOPE_HASH_MISMATCH/);
});
