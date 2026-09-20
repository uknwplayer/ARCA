import test from "node:test";
import assert from "node:assert/strict";
import {ARCA_REPOSITORY_VERIFY_REF_RESULT_FORMAT,normalizeRepositoryVerifyRefParams,repositoryVerifyRefCommandSet,verifyRepositoryVerifyRefOutput} from "../src/machine-bridge/repository-verify-ref.mjs";

const SHA="a".repeat(40);
const HASH="b".repeat(64);
const params={repository:"example/arca",pullRequest:187,expectedHeadSha:SHA};

function output({head=SHA,exitCodes=[0,0,0]}={}){
  const commands=repositoryVerifyRefCommandSet().map((command,index)=>({...command,exitCode:exitCodes[index],stdoutSha256:HASH,stderrSha256:HASH}));
  return {
    format:ARCA_REPOSITORY_VERIFY_REF_RESULT_FORMAT,
    target:{repository:"example/arca",pullRequest:187,expectedHeadSha:SHA,observedHeadSha:head},
    checkout:{detached:true,targetMutated:false},
    environment:{nodeVersion:"v22.18.0",npmVersion:"10.9.3"},
    commands,
    allCommandsPassed:commands.every(command=>command.exitCode===0),
    arbitraryCommandExecuted:false,
    repositoryMutationObserved:false
  };
}

test("repository.verify-ref params are exact and repository allowlisted",()=>{
  assert.deepEqual(normalizeRepositoryVerifyRefParams(params,{allowedRepositories:["example/arca"]}),params);
  assert.throws(()=>normalizeRepositoryVerifyRefParams({...params,command:"rm -rf /"},{allowedRepositories:["example/arca"]}),/FIELDS_INVALID/);
  assert.throws(()=>normalizeRepositoryVerifyRefParams(params,{allowedRepositories:["other/repo"]}),/NOT_ALLOWED/);
});

test("repository.verify-ref command set is fixed and contains no caller shell",()=>{
  assert.deepEqual(repositoryVerifyRefCommandSet(),[
    {id:"install",argv:["npm","ci","--ignore-scripts","--no-audit","--no-fund"]},
    {id:"test",argv:["npm","test"]},
    {id:"check",argv:["npm","run","check"]}
  ]);
});

test("verification output must match exact head and exact fixed commands",()=>{
  const verified=verifyRepositoryVerifyRefOutput(output(),params);
  assert.equal(verified.allCommandsPassed,true);
  assert.equal(verified.observedHeadSha,SHA);
  assert.throws(()=>verifyRepositoryVerifyRefOutput(output({head:"c".repeat(40)}),params),/HEAD_MISMATCH/);
  const tampered=output();tampered.commands[1].argv=["npm","run","something-else"];
  assert.throws(()=>verifyRepositoryVerifyRefOutput(tampered,params),/COMMAND_SET_MISMATCH/);
});

test("failed fixed command remains evidence but is not a passing verification",()=>{
  const failed=output({exitCodes:[0,1,0]});
  assert.throws(()=>verifyRepositoryVerifyRefOutput(failed,params),/COMMAND_FAILED/);
  assert.equal(verifyRepositoryVerifyRefOutput(failed,params,{requireSuccess:false}).allCommandsPassed,false);
});


test("repository.verify-ref rejects runtimes older than Node 22.18",()=>{
  const tooOld=output();
  tooOld.environment.nodeVersion="v22.16.0";
  assert.throws(()=>verifyRepositoryVerifyRefOutput(tooOld,params),/NODE_VERSION_TOO_OLD/);
});
