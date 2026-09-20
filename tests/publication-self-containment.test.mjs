import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {scanStaticPublicDependencyClosure,staticRelativeSpecifiers} from "../src/publication-self-containment.mjs";

test("static dependency parser finds relative imports exports dynamic imports and require",()=>{
  const source=["import x from",JSON.stringify("./a.js")+";","export {y} from",JSON.stringify("../b.ts")+";","const z=import("+JSON.stringify("./c.mjs")+");","const q=require("+JSON.stringify("./d")+");","import fs from "+JSON.stringify("node:fs")+";"].join(" ");
  const refs=staticRelativeSpecifiers(source);
  assert.deepEqual(refs,["../b.ts","./a.js","./c.mjs","./d"]);
});

test("dependency closure accepts included relative module",async(t)=>{
  const root=await mkdtemp(join(tmpdir(),"arca-pub-closure-"));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,"src"),{recursive:true});
  await writeFile(join(root,"src","a.mjs"),["import",JSON.stringify("./b.mjs")+";"].join(" ")+"\\n");
  await writeFile(join(root,"src","b.mjs"),'export const b=1;\n');
  const v=await scanStaticPublicDependencyClosure([
    {path:"src/a.mjs",absolutePath:join(root,"src","a.mjs")},
    {path:"src/b.mjs",absolutePath:join(root,"src","b.mjs")}
  ]);
  assert.deepEqual(v,[]);
});

test("dependency closure fails when public file imports excluded relative module",async(t)=>{
  const root=await mkdtemp(join(tmpdir(),"arca-pub-closure-missing-"));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,"src"),{recursive:true});
  await writeFile(join(root,"src","a.mjs"),["import",JSON.stringify("../private/secret.mjs")+";"].join(" ")+"\\n");
  const v=await scanStaticPublicDependencyClosure([{path:"src/a.mjs",absolutePath:join(root,"src","a.mjs")}]);
  assert.equal(v.length,1);
  assert.equal(v[0].kind,"public-static-dependency-missing");
  assert.equal(v[0].rule,"../private/secret.mjs");
});
