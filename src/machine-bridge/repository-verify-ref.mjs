export const ARCA_REPOSITORY_VERIFY_REF_ACTION="repository.verify-ref";
export const ARCA_REPOSITORY_VERIFY_REF_RESULT_FORMAT="arca-repository-verify-ref-result-v1";
export const ARCA_REPOSITORY_VERIFY_REF_COMMAND_SET=Object.freeze([
  Object.freeze({id:"install",argv:Object.freeze(["npm","ci","--ignore-scripts","--no-audit","--no-fund"])}),
  Object.freeze({id:"test",argv:Object.freeze(["npm","test"])}),
  Object.freeze({id:"check",argv:Object.freeze(["npm","run","check"])})
]);

const REPOSITORY=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA40=/^[a-f0-9]{40}$/;
const HASH64=/^[a-f0-9]{64}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return JSON.parse(JSON.stringify(value))}
function assertNodeVersion(value){
  const text=String(value??"").trim();
  const match=text.match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if(!match)throw new Error("ARCA_REPOSITORY_VERIFY_REF_NODE_VERSION_INVALID");
  const [major,minor,patch]=match.slice(1).map(Number);
  if(major<22||(major===22&&minor<18))throw new Error("ARCA_REPOSITORY_VERIFY_REF_NODE_VERSION_TOO_OLD");
  return {text,major,minor,patch};
}
function exactKeys(value,allowed){
  const keys=Object.keys(value).sort(), expected=[...allowed].sort();
  if(JSON.stringify(keys)!==JSON.stringify(expected))throw new Error("ARCA_REPOSITORY_VERIFY_REF_PARAMS_FIELDS_INVALID");
}

export function normalizeRepositoryVerifyRefParams(params,{allowedRepositories=null}={}){
  if(!plain(params))throw new Error("ARCA_REPOSITORY_VERIFY_REF_PARAMS_INVALID");
  exactKeys(params,["repository","pullRequest","expectedHeadSha"]);
  const repository=String(params.repository??"").trim();
  const pullRequest=Number(params.pullRequest);
  const expectedHeadSha=String(params.expectedHeadSha??"").trim().toLowerCase();
  if(!REPOSITORY.test(repository))throw new Error("ARCA_REPOSITORY_VERIFY_REF_REPOSITORY_INVALID");
  if(!Number.isSafeInteger(pullRequest)||pullRequest<1)throw new Error("ARCA_REPOSITORY_VERIFY_REF_PR_INVALID");
  if(!SHA40.test(expectedHeadSha))throw new Error("ARCA_REPOSITORY_VERIFY_REF_HEAD_SHA_INVALID");
  if(allowedRepositories!==null){
    if(!Array.isArray(allowedRepositories)||allowedRepositories.length===0)throw new Error("ARCA_REPOSITORY_VERIFY_REF_ALLOWLIST_REQUIRED");
    const allowed=new Set(allowedRepositories.map(value=>String(value??"").trim()));
    if(!allowed.has(repository))throw new Error("ARCA_REPOSITORY_VERIFY_REF_REPOSITORY_NOT_ALLOWED");
  }
  return Object.freeze({repository,pullRequest,expectedHeadSha});
}

export function repositoryVerifyRefCommandSet(){
  return ARCA_REPOSITORY_VERIFY_REF_COMMAND_SET.map(item=>Object.freeze({id:item.id,argv:[...item.argv]}));
}

export function verifyRepositoryVerifyRefOutput(output,params,{requireSuccess=true}={}){
  const expected=normalizeRepositoryVerifyRefParams(params);
  if(!plain(output)||output.format!==ARCA_REPOSITORY_VERIFY_REF_RESULT_FORMAT)throw new Error("ARCA_REPOSITORY_VERIFY_REF_OUTPUT_INVALID");
  if(!plain(output.target))throw new Error("ARCA_REPOSITORY_VERIFY_REF_TARGET_INVALID");
  if(output.target.repository!==expected.repository||Number(output.target.pullRequest)!==expected.pullRequest)throw new Error("ARCA_REPOSITORY_VERIFY_REF_TARGET_MISMATCH");
  const observed=String(output.target.observedHeadSha??"").trim().toLowerCase();
  if(observed!==expected.expectedHeadSha)throw new Error("ARCA_REPOSITORY_VERIFY_REF_HEAD_MISMATCH");
  if(output.target.expectedHeadSha!==expected.expectedHeadSha)throw new Error("ARCA_REPOSITORY_VERIFY_REF_EXPECTED_HEAD_MISMATCH");
  if(output.checkout?.detached!==true||output.checkout?.targetMutated!==false)throw new Error("ARCA_REPOSITORY_VERIFY_REF_CHECKOUT_SAFETY_INVALID");
  const node=assertNodeVersion(output.environment?.nodeVersion);
  if(typeof output.environment?.npmVersion!=="string"||!output.environment.npmVersion.trim())throw new Error("ARCA_REPOSITORY_VERIFY_REF_NPM_VERSION_MISSING");
  if(!Array.isArray(output.commands)||output.commands.length!==ARCA_REPOSITORY_VERIFY_REF_COMMAND_SET.length)throw new Error("ARCA_REPOSITORY_VERIFY_REF_COMMANDS_INVALID");
  for(let i=0;i<ARCA_REPOSITORY_VERIFY_REF_COMMAND_SET.length;i+=1){
    const expectedCommand=ARCA_REPOSITORY_VERIFY_REF_COMMAND_SET[i], actual=output.commands[i];
    if(!plain(actual)||actual.id!==expectedCommand.id||JSON.stringify(actual.argv)!==JSON.stringify(expectedCommand.argv))throw new Error("ARCA_REPOSITORY_VERIFY_REF_COMMAND_SET_MISMATCH");
    if(!Number.isSafeInteger(actual.exitCode))throw new Error("ARCA_REPOSITORY_VERIFY_REF_EXIT_CODE_INVALID");
    for(const field of ["stdoutSha256","stderrSha256"])if(typeof actual[field]!=="string"||!HASH64.test(actual[field]))throw new Error("ARCA_REPOSITORY_VERIFY_REF_LOG_HASH_INVALID");
  }
  const allPassed=output.commands.every(command=>command.exitCode===0);
  if(Boolean(output.allCommandsPassed)!==allPassed)throw new Error("ARCA_REPOSITORY_VERIFY_REF_PASS_FLAG_INVALID");
  if(output.arbitraryCommandExecuted!==false)throw new Error("ARCA_REPOSITORY_VERIFY_REF_ARBITRARY_COMMAND_FORBIDDEN");
  if(output.repositoryMutationObserved!==false)throw new Error("ARCA_REPOSITORY_VERIFY_REF_REPOSITORY_MUTATION_INVALID");
  if(requireSuccess&&!allPassed)throw new Error("ARCA_REPOSITORY_VERIFY_REF_COMMAND_FAILED");
  return Object.freeze({
    repository:expected.repository,
    pullRequest:expected.pullRequest,
    expectedHeadSha:expected.expectedHeadSha,
    observedHeadSha:observed,
    nodeVersion:node.text,
    npmVersion:output.environment.npmVersion,
    allCommandsPassed:allPassed,
    commandEvidence:clone(output.commands)
  });
}
