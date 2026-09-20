import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  sealCustodyDirectory,
  openCustodyEnvelope
} from "../src/machine-bridge/encrypted-custody-envelope.mjs";

const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-custody-envelope-"));
const secret="correct horse battery staple custody secret";
const revision="3d2364dfffc12819b7f770ab0210871ddd92e61a";
const scopeHash="a".repeat(64);

function fixture(){
  const root=tmp();
  fs.mkdirSync(path.join(root,"BR-UF-AC"),{recursive:true});
  fs.writeFileSync(path.join(root,"BR-UF-AC","manifest.json"),JSON.stringify({acquisitionId:"ACQ-1"}));
  fs.writeFileSync(path.join(root,"BR-UF-AC","original.bin"),Buffer.from("private fixture bytes"));
  return root;
}

function envelope(){
  return sealCustodyDirectory({
    root:fixture(),
    passphrase:secret,
    repository:"uknwplayer/ARCA",
    revision,
    scopeHash,
    sealedAt:"2026-09-21T03:00:00.000Z"
  });
}

test("custody directory seals and reopens with exact hashes",()=>{
  const sealed=envelope();
  assert.equal(sealed.status,"SEALED");
  assert.equal(sealed.algorithm,"AES-256-GCM");
  assert.equal(sealed.plaintextIncluded,false);
  assert.equal(sealed.fileCount,2);
  assert.ok(!JSON.stringify(sealed).includes("private fixture bytes"));

  const payload=openCustodyEnvelope({envelope:sealed,passphrase:secret});
  assert.equal(payload.fileCount,2);
  assert.equal(payload.scopeHash,scopeHash);
  assert.equal(payload.sealedAt,sealed.sealedAt);
  assert.ok(payload.files.every(file=>/^[a-f0-9]{64}$/.test(file.sha256)));
});

test("wrong passphrase fails authentication",()=>{
  assert.throws(
    ()=>openCustodyEnvelope({envelope:envelope(),passphrase:"this is definitely the wrong passphrase 123"}),
    /AUTH_FAILED/
  );
});

test("ciphertext tampering fails authentication",()=>{
  const sealed=envelope();
  const ciphertext=Buffer.from(sealed.ciphertext,"base64");
  ciphertext[0]^=1;
  assert.throws(
    ()=>openCustodyEnvelope({
      envelope:{...sealed,ciphertext:ciphertext.toString("base64")},
      passphrase:secret
    }),
    /AUTH_FAILED/
  );
});

test("public metadata tampering fails binding",()=>{
  const sealed=envelope();
  assert.throws(
    ()=>openCustodyEnvelope({
      envelope:{...sealed,sealedAt:"2026-09-21T04:00:00.000Z"},
      passphrase:secret
    }),
    /BINDING_MISMATCH/
  );
});

test("short passphrase is rejected before reading custody",()=>{
  assert.throws(()=>sealCustodyDirectory({
    root:fixture(),
    passphrase:"too-short",
    repository:"uknwplayer/ARCA",
    revision,
    scopeHash
  }),/PASSPHRASE_WEAK/);
});

test("symlinks fail closed",()=>{
  const root=fixture();
  const outside=path.join(tmp(),"outside.txt");
  fs.writeFileSync(outside,"outside");
  try{
    fs.symlinkSync(outside,path.join(root,"link.txt"));
  }catch{
    return;
  }
  assert.throws(()=>sealCustodyDirectory({
    root,
    passphrase:secret,
    repository:"uknwplayer/ARCA",
    revision,
    scopeHash
  }),/SYMLINK_FORBIDDEN/);
});
