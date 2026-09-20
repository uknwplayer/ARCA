const byId=(id)=>document.getElementById(id);
const unlockPanel=byId("unlock-panel");
const consolePanel=byId("console");
const connection=byId("connection");
const unlockError=byId("unlock-error");
const messages=byId("messages");
const chatStatus=byId("chat-status");
const passkeyLoginStatus=byId("passkey-login-status");
const enrollStatus=byId("enroll-status");
const upgradeStatus=byId("upgrade-status");
const stepUpStatus=byId("step-up-status");
const reviewPanel=byId("review-panel");
const reviewList=byId("review-list");
const reviewStatus=byId("review-status");
const workflowPanel=byId("workflow-panel");
const workflowList=byId("workflow-list");
const workflowStatus=byId("workflow-status");
const workflowCapabilities=byId("workflow-capabilities");
let creatorToken=sessionStorage.getItem("arca.creator.session")||"";
let lastState=null;
const pendingWatchers=new Set();
const workflowReasoningWatchers=new Set();
let pendingListLoading=false;
let workflowReasoningListLoading=false;

function addMessage(kind,text){const node=document.createElement("div");node.className=`message ${kind}`;node.textContent=String(text);messages.appendChild(node);messages.scrollTop=messages.scrollHeight}
function setLocked(message="bloqueado"){creatorToken="";lastState=null;sessionStorage.removeItem("arca.creator.session");connection.textContent=message;unlockPanel.classList.remove("hidden");consolePanel.classList.add("hidden")}
function setUnlocked(){connection.textContent=lastState?.security?.strongSession?"sessão forte":"sessão local";unlockPanel.classList.add("hidden");consolePanel.classList.remove("hidden")}
function supportsPasskeys(){return !!(window.PublicKeyCredential&&navigator.credentials)}
function assertLocalhost(){if(location.hostname!=="localhost")throw Object.assign(new Error("Abra o Creator Console pela URL localhost exibida pelo launcher para usar passkeys."),{code:"PASSKEY_LOCALHOST_REQUIRED"})}
function decodeBase64url(value){const padded=String(value).replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-String(value).length%4)%4);const binary=atob(padded);const output=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)output[i]=binary.charCodeAt(i);return output}
function encodeBase64url(value){if(value===null||value===undefined)return null;const bytes=new Uint8Array(value);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function registrationPublicKey(input){const value=structuredClone(input);value.challenge=decodeBase64url(value.challenge);value.user.id=decodeBase64url(value.user.id);if(Array.isArray(value.excludeCredentials))for(const item of value.excludeCredentials)item.id=decodeBase64url(item.id);return value}
function authenticationPublicKey(input){const value=structuredClone(input);value.challenge=decodeBase64url(value.challenge);if(Array.isArray(value.allowCredentials))for(const item of value.allowCredentials)item.id=decodeBase64url(item.id);return value}
function serializeRegistration(credential){return {id:credential.id,type:credential.type,response:{clientDataJSON:encodeBase64url(credential.response.clientDataJSON),attestationObject:encodeBase64url(credential.response.attestationObject)}}}
function serializeAssertion(credential){return {id:credential.id,type:credential.type,response:{clientDataJSON:encodeBase64url(credential.response.clientDataJSON),authenticatorData:encodeBase64url(credential.response.authenticatorData),signature:encodeBase64url(credential.response.signature),userHandle:credential.response.userHandle?encodeBase64url(credential.response.userHandle):null}}}
async function fetchJson(path,{method="GET",body,unlock=false,headers={}}={}){
  const response=await fetch(path,{method,headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),...(creatorToken?{"X-ARCA-Creator-Session":creatorToken}:{}),...(unlock?{"X-ARCA-Creator-Unlock":"1"}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json();
  if(!response.ok){const error=new Error(payload?.error?.message||`HTTP ${response.status}`);error.code=payload?.error?.code;error.status=response.status;throw error}
  return payload;
}
function semanticOutput(result){const outer=result?.output;const value=outer&&typeof outer==="object"&&Object.prototype.hasOwnProperty.call(outer,"output")?outer.output:outer;return typeof value==="string"?value:JSON.stringify(value,null,2)}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function collectPendingChat(requestId){
  const result=await fetchJson("/api/chat/collect",{method:"POST",body:{requestId}});
  if(result.status==="completed"){
    addMessage("arca",semanticOutput(result));chatStatus.textContent=`${requestId} · concluído`;return true
  }
  const state=result.reasoningState||result.output?.state||"aguardando";
  if(state==="awaiting-human-review"||state==="blocked"||state==="needs-more-information"||state==="manual-policy-required"){
    if(result.output?.output!==undefined)addMessage("arca",semanticOutput(result));
    addMessage("system",`Solicitação ${requestId}: ${state}. Use a seção Revisão Humana para decidir a continuação.`);
    chatStatus.textContent=`${requestId} · ${state}`;await refreshReviews();return true
  }
  chatStatus.textContent=`${requestId} · ${state}`;return false
}
async function watchPendingChat(requestId){
  if(!requestId||pendingWatchers.has(requestId))return;pendingWatchers.add(requestId);
  try{
    chatStatus.textContent=`${requestId} · aguardando raciocínio cifrado…`;
    while(creatorToken){
      await sleep(2500);
      const status=await fetchJson(`/api/chat/status?requestId=${encodeURIComponent(requestId)}`);
      const state=status.reasoningState||status.output?.state||"unknown";
      if(state==="result-ready"||state==="completed"){
        if(await collectPendingChat(requestId))break;
      }else if(state==="awaiting-human-review"||state==="blocked"||state==="needs-more-information"||state==="manual-policy-required"){
        chatStatus.textContent=`${requestId} · ${state}`;await refreshReviews();break
      }else if(state==="failed"){
        addMessage("system",`Raciocínio ${requestId} terminou em estado failed.`);chatStatus.textContent=`${requestId} · falhou`;break
      }else chatStatus.textContent=`${requestId} · ${state}`;
    }
  }catch(error){
    if(error.status===401)setLocked("sessão expirada");else addMessage("system",`Falha ao acompanhar ${requestId}: ${error.message}`)
  }finally{pendingWatchers.delete(requestId)}
}
async function resumePendingChats(){
  if(pendingListLoading||!creatorToken||lastState?.security?.strongSession!==true||lastState?.chat?.pendingList!==true)return;
  pendingListLoading=true;
  try{
    const result=await fetchJson("/api/chat/pending");const items=result?.output?.items||[];
    for(const item of items)watchPendingChat(item.requestId);
  }catch(error){if(error.status===401)setLocked("sessão expirada")}finally{pendingListLoading=false}
}
function reviewOutputText(item){
  if(item?.payload?.output!==undefined)return typeof item.payload.output==="string"?item.payload.output:JSON.stringify(item.payload.output,null,2);
  if(item?.payload?.outputOmitted===true)return `Conteúdo omitido do registro local por tamanho. Hash: ${item.payload.outputHash||"indisponível"} · ${item.payload.outputBytes||0} bytes.`;
  return "";
}
function reviewMetaText(item){
  const classification=item?.payload?.privacyClassification;const auth=item?.payload?.authorizationContext;const parts=[item.kind,item.source?.requestId];
  if(classification?.privacyClass)parts.push(`privacy: ${classification.privacyClass}`);
  if(auth?.kind==="registered-workflow")parts.push(`workflow: ${auth.proposalId}`,`plan: ${String(auth.planHash||"").slice(0,16)}…`,`definition: ${String(auth.workflowDefinitionHash||"").slice(0,16)}…`);
  if(item.priority)parts.push(`priority: ${item.priority}`);
  return parts.filter(Boolean).join(" · ");
}
function reviewAuthorizationText(item){
  const auth=item?.payload?.authorizationContext;
  if(auth?.kind!=="registered-workflow")return "";
  return `Aprovar esta revisão pode liberar somente o workflow ${auth.proposalId}, planHash ${auth.planHash}, definitionHash ${auth.workflowDefinitionHash}. Binding: ${auth.bindingHash}.`;
}
async function decideReview(item,decision,reason){
  if(!reason.trim())throw new Error("Informe o motivo da decisão.");
  return fetchJson("/api/reviews/resolve",{method:"POST",body:{reviewId:item.reviewId,decision,reason:reason.trim(),expectedRecordHash:item.recordHash}});
}
function renderReviews(items){
  reviewList.textContent="";
  if(!items.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="Nenhuma revisão pendente.";reviewList.appendChild(empty);return}
  for(const item of items){
    const card=document.createElement("article");card.className="review-item";
    const title=document.createElement("h3");title.textContent=item.title||item.reviewId;card.appendChild(title);
    const meta=document.createElement("div");meta.className="review-meta";meta.textContent=reviewMetaText(item);card.appendChild(meta);
    const summary=document.createElement("p");summary.textContent=item.summary||"";card.appendChild(summary);
    const authorization=reviewAuthorizationText(item);if(authorization){const notice=document.createElement("p");notice.className="review-authorization";notice.textContent=authorization;card.appendChild(notice)}
    const output=reviewOutputText(item);if(output){const pre=document.createElement("div");pre.className="review-output";pre.textContent=output;card.appendChild(pre)}
    const reason=document.createElement("textarea");reason.rows=2;reason.maxLength=8000;reason.placeholder="Motivo da decisão (obrigatório)";card.appendChild(reason);
    const actions=document.createElement("div");actions.className="review-actions";
    const choices=[["approve","Aprovar",""],["needs-more-information","Pedir mais informações","more"],["reject","Rejeitar","reject"]];
    for(const [decision,label,klass] of choices){
      const button=document.createElement("button");button.type="button";button.textContent=label;if(klass)button.className=klass;
      button.addEventListener("click",async()=>{
        for(const child of actions.querySelectorAll("button"))child.disabled=true;reviewStatus.textContent="registrando decisão…";
        try{
          const result=await decideReview(item,decision,reason.value);
          const gate=result.gate?.state||"decisão registrada";reviewStatus.textContent=`${item.reviewId} · ${gate}`;
          addMessage("system",`Revisão ${item.reviewId}: ${decision} → ${gate}.`);
          await refreshState()
        }catch(error){reviewStatus.textContent=error.message;for(const child of actions.querySelectorAll("button"))child.disabled=false}
      });actions.appendChild(button)
    }
    card.appendChild(actions);reviewList.appendChild(card)
  }
}
async function refreshReviews(){
  if(!creatorToken||lastState?.security?.strongSession!==true){reviewPanel.classList.add("hidden");reviewList.textContent="";return}
  reviewPanel.classList.remove("hidden");reviewStatus.textContent="carregando…";
  try{const result=await fetchJson("/api/reviews?status=pending");renderReviews(result.items||[]);reviewStatus.textContent=`${(result.items||[]).length} pendente(s)`}
  catch(error){if(error.status===401)setLocked("sessão expirada");else if(error.status===403){reviewPanel.classList.add("hidden")}else reviewStatus.textContent=`Falha: ${error.message}`}
}
function workflowReasoningOutput(result){
  const output=result?.output?.output;
  return output===undefined?"":(typeof output==="string"?output:JSON.stringify(output,null,2))
}
async function collectWorkflowReasoning(requestId){
  const result=await fetchJson("/api/workflows/reason/collect",{method:"POST",body:{requestId}});
  const state=result.reasoningState||result.output?.state||"unknown";
  if(result.output?.output!==undefined){const semantic=workflowReasoningOutput(result);if(semantic)addMessage("arca",semantic)}
  if(state==="awaiting-human-review"||state==="blocked"||state==="needs-more-information"||state==="manual-policy-required"){
    addMessage("system",`Workflow reasoning ${requestId}: ${state}. A decisão está na Revisão Humana e vinculada ao workflow registrado.`);
    workflowStatus.textContent=`${requestId} · ${state}`;await refreshReviews();return true
  }
  if(state==="completed"){workflowStatus.textContent=`${requestId} · concluído/autorizado`;await refreshReviews();return true}
  workflowStatus.textContent=`${requestId} · ${state}`;return false
}
async function watchWorkflowReasoning(requestId){
  if(!requestId||workflowReasoningWatchers.has(requestId))return;workflowReasoningWatchers.add(requestId);
  try{
    workflowStatus.textContent=`${requestId} · reasoning privado pendente…`;
    while(creatorToken){
      await sleep(2500);
      const result=await fetchJson(`/api/workflows/reason/status?requestId=${encodeURIComponent(requestId)}`);
      const state=result.reasoningState||result.output?.state||"unknown";
      if(state==="result-ready"){
        if(await collectWorkflowReasoning(requestId))break
      }else if(state==="awaiting-human-review"||state==="blocked"||state==="needs-more-information"||state==="manual-policy-required"||state==="completed"){
        workflowStatus.textContent=`${requestId} · ${state}`;await refreshReviews();break
      }else if(state==="failed"||state==="binding-error"){
        workflowStatus.textContent=`${requestId} · ${state}`;addMessage("system",`Workflow reasoning ${requestId} terminou em ${state}.`);break
      }else workflowStatus.textContent=`${requestId} · ${state}`
    }
  }catch(error){if(error.status===401)setLocked("sessão expirada");else workflowStatus.textContent=`Falha ao acompanhar ${requestId}: ${error.message}`}
  finally{workflowReasoningWatchers.delete(requestId)}
}
async function startWorkflowReasoning(item,message){
  const text=String(message??"").trim();if(!text)throw new Error("Informe a instrução privada de reasoning.");
  workflowStatus.textContent="criando binding criptográfico e iniciando reasoning privado…";
  const result=await fetchJson("/api/workflows/reason",{method:"POST",body:{proposalId:item.proposalId,expectedRecordHash:item.recordHash,expectedPlanHash:item.plan.planHash,message:text}});
  const state=result.reasoningState||result.output?.state||"unknown";workflowStatus.textContent=`${item.requestId} · ${state}`;
  addMessage("system",`Reasoning vinculado ao workflow ${item.proposalId}. O texto da instrução não entra no binding persistido; apenas seu hash.`);
  if(state==="result-ready")await collectWorkflowReasoning(item.requestId);
  else if(state==="awaiting-human-review"||state==="completed")await refreshReviews();
  else watchWorkflowReasoning(item.requestId);
  return result
}
async function resumeWorkflowReasoning(){
  if(workflowReasoningListLoading||!creatorToken||lastState?.security?.strongSession!==true||lastState?.workflows?.reasoningBinding!==true)return;
  workflowReasoningListLoading=true;
  try{
    const result=await fetchJson("/api/workflows/reason/pending");const items=result?.output?.items||[];
    for(const item of items){
      if(["awaiting-reasoning","registered","result-ready"].includes(item.state))watchWorkflowReasoning(item.requestId);
      else if(item.state==="awaiting-human-review")refreshReviews()
    }
  }catch(error){if(error.status===401)setLocked("sessão expirada")}finally{workflowReasoningListLoading=false}
}
function workflowPlanText(item){
  const lines=[];
  for(const step of item?.plan?.steps||[]){
    const target=step.recipeId||"sem recipe";
    const candidates=(step.candidateParticipantIds||[]).join(", ")||"nenhum";
    lines.push(`${step.stepId}: capability=${step.capabilityId} -> ${target} | ${step.status} | candidates=${candidates}${step.gap?` | gap=${step.gap}`:""}`);
  }
  return lines.join("\n");
}
function workflowPolicyText(item){
  const p=item?.executionPolicy||{};
  return `budget: ${p.maxSubmitAttemptsPerJob??"?"}/job · ${p.maxTotalSubmitAttempts??"?"}/request${p.deadlineAt?` · deadline ${new Date(p.deadlineAt).toLocaleString()}`:""}`;
}
async function registerWorkflowProposal(item,confirmBox,button){
  if(confirmBox.checked!==true)throw new Error("Confirme explicitamente o registro deste workflow.");
  button.disabled=true;workflowStatus.textContent="registrando workflow fechado…";
  try{
    const result=await fetchJson("/api/workflows/register",{method:"POST",body:{proposalId:item.proposalId,expectedRecordHash:item.recordHash,expectedPlanHash:item.plan.planHash,confirmRegistration:true}});
    workflowStatus.textContent=`${item.proposalId} · registrado`;
    addMessage("system",`Workflow ${item.proposalId} registrado. Ele permanece inerte até uma autorização substantiva/wake válida para o mesmo requestId.`);
    await refreshState();return result
  }catch(error){button.disabled=false;workflowStatus.textContent=error.message;throw error}
}
function renderWorkflowProposals(items){
  workflowList.textContent="";
  if(!items.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="Nenhuma proposta estruturada.";workflowList.appendChild(empty);return}
  for(const item of items){
    const card=document.createElement("article");card.className="workflow-item";
    const title=document.createElement("h3");title.textContent=item.proposalId;card.appendChild(title);
    const meta=document.createElement("div");meta.className="workflow-meta";meta.textContent=`${item.status} · request ${item.requestId}${item.objectiveId?` · objective ${item.objectiveId}`:""} · plan ${String(item.plan?.planHash||"").slice(0,16)}…`;card.appendChild(meta);
    const pre=document.createElement("div");pre.className="workflow-plan";pre.textContent=workflowPlanText(item)||"sem steps";card.appendChild(pre);
    const policy=document.createElement("p");policy.className="muted";policy.textContent=workflowPolicyText(item);card.appendChild(policy);
    if(item.status==="blocked"){
      const blocked=document.createElement("p");blocked.className="error";blocked.textContent=`Bloqueado: ${(item.plan?.blockedSteps||[]).join(", ")||"policy/capability gap"}`;card.appendChild(blocked)
    }else if(item.status==="ready"){
      const label=document.createElement("label");label.className="workflow-confirm";const check=document.createElement("input");check.type="checkbox";const span=document.createElement("span");span.textContent="Confirmo registrar exatamente este planHash/workflow fechado. Isso não executa o workflow por si só.";label.append(check,span);card.appendChild(label);
      const actions=document.createElement("div");actions.className="workflow-actions";const button=document.createElement("button");button.type="button";button.textContent="Registrar workflow";const state=document.createElement("span");state.className="workflow-state";state.textContent="aguardando confirmação";button.addEventListener("click",async()=>{try{await registerWorkflowProposal(item,check,button);state.textContent="registrado"}catch(error){state.textContent=error.message}});actions.append(button,state);card.appendChild(actions)
    }else if(item.status==="registered"){
      const registered=document.createElement("p");registered.className="muted";registered.textContent=`Registrado · definition ${String(item.registration?.workflowDefinitionHash||"").slice(0,16)}… · plan ${String(item.plan?.planHash||"").slice(0,16)}… · executionPerformed=false`;card.appendChild(registered);
      if(lastState?.workflows?.reasoningBinding===true){
        const reasoning=document.createElement("textarea");reasoning.rows=3;reasoning.maxLength=16000;reasoning.placeholder="Instrução privada de reasoning vinculada a este workflow. Ex.: analise riscos e evidências antes de eu decidir se libero a continuação.";card.appendChild(reasoning);
        const reasoningActions=document.createElement("div");reasoningActions.className="workflow-actions";const reasoningButton=document.createElement("button");reasoningButton.type="button";reasoningButton.textContent="Iniciar reasoning vinculado";const binding=document.createElement("span");binding.className="workflow-state";binding.textContent="A revisão mostrará proposal/plan/definition hashes antes da aprovação.";
        reasoningButton.addEventListener("click",async()=>{reasoningButton.disabled=true;try{await startWorkflowReasoning(item,reasoning.value);binding.textContent="reasoning iniciado"}catch(error){binding.textContent=error.message;reasoningButton.disabled=false}});
        reasoningActions.append(reasoningButton,binding);card.appendChild(reasoningActions)
      }
    }
    workflowList.appendChild(card)
  }
}
async function refreshWorkflowCapabilities(){
  try{
    const result=await fetchJson("/api/workflows/capabilities");
    const policies=(result.policies||[]).map(item=>`${item.capabilityId} → ${item.recipeId}`).join(" · ");
    workflowCapabilities.textContent=policies?`Policies disponíveis: ${policies}`:"Nenhuma policy de workflow disponível."
  }catch(error){if(error.status===401)setLocked("sessão expirada");else workflowCapabilities.textContent=`Capabilities indisponíveis: ${error.message}`}
}
async function refreshWorkflowProposals(){
  if(!creatorToken||lastState?.security?.strongSession!==true||lastState?.workflows?.structuredProposal!==true){workflowPanel.classList.add("hidden");workflowList.textContent="";return}
  workflowPanel.classList.remove("hidden");workflowStatus.textContent="carregando propostas…";
  try{const result=await fetchJson("/api/workflows/proposals?status=all");renderWorkflowProposals(result.items||[]);workflowStatus.textContent=`${(result.items||[]).length} proposta(s)`}
  catch(error){if(error.status===401)setLocked("sessão expirada");else if(error.status===403)workflowPanel.classList.add("hidden");else workflowStatus.textContent=`Falha: ${error.message}`}
}
async function refreshWorkflows(){
  if(!creatorToken||lastState?.security?.strongSession!==true||lastState?.workflows?.structuredProposal!==true){workflowPanel.classList.add("hidden");return}
  await Promise.all([refreshWorkflowCapabilities(),refreshWorkflowProposals()]);
  resumeWorkflowReasoning()
}
function updateSecurity(state){
  const security=state.security||{};const passkeys=security.passkeys||{};const strong=security.strongSession===true;
  byId("auth-state").textContent=strong?"forte":security.sessionAuthMethod||"local";byId("passkey-count").textContent=`passkeys: ${passkeys.active??0} ativas / ${passkeys.count??0} total`;
  byId("security-summary").textContent=strong?`Autenticada por ${security.sessionAuthMethod}.`:`Sessão ${security.sessionAuthMethod||"local"}; ações elevadas permanecem indisponíveis.`;
  byId("step-up-state").textContent=security.stepUpAt?`step-up ${new Date(security.stepUpAt).toLocaleTimeString()}`:"sem step-up";
  byId("first-passkey").classList.toggle("hidden",passkeys.canEnrollFirst!==true);
  byId("passkey-upgrade").classList.toggle("hidden",!(passkeys.active>0&&!strong));
  byId("strong-actions").classList.toggle("hidden",!strong);
  reviewPanel.classList.toggle("hidden",!strong);
  workflowPanel.classList.toggle("hidden",!(strong&&state.workflows?.structuredProposal===true));
  setUnlocked();
}
async function refreshState(){
  try{const state=await fetchJson("/api/state");lastState=state;byId("agent-state").textContent=state.agentAvailable?"raciocínio conectado":"sem provedor de raciocínio";byId("investigations").textContent=String(state.investigations.count);byId("reviews").textContent=String(state.humanReview.pending);byId("audit-count").textContent=`${state.audit.events} eventos`;byId("audit-head").textContent=state.audit.head?`${state.audit.head.slice(0,16)}…`:"sem head";updateSecurity(state);resumePendingChats();refreshReviews();refreshWorkflows()}catch(error){if(error.status===401)setLocked("sessão expirada");else addMessage("system",`Falha ao ler estado: ${error.message}`)}}
async function runAuthentication({purpose="authenticate"}={}){
  assertLocalhost();if(!supportsPasskeys())throw new Error("Este navegador não oferece WebAuthn/passkeys.");
  const prefix=purpose==="step-up"?"/api/passkeys/step-up":"/api/passkeys/auth";const options=await fetchJson(`${prefix}/options`,{method:"POST",body:{},headers:{"X-ARCA-Creator-Passkey":"1"}});const credential=await navigator.credentials.get({publicKey:authenticationPublicKey(options.publicKey)});if(!credential)throw new Error("Nenhuma credencial foi retornada pelo authenticator.");const verified=await fetchJson(`${prefix}/verify`,{method:"POST",body:{challengeId:options.challengeId,credential:serializeAssertion(credential)},headers:{"X-ARCA-Creator-Passkey":"1"}});return verified;
}
async function passkeyLogin(){
  passkeyLoginStatus.textContent="autenticando…";upgradeStatus.textContent="autenticando…";
  try{const grant=await runAuthentication({purpose:"authenticate"});creatorToken=grant.token;sessionStorage.setItem("arca.creator.session",creatorToken);passkeyLoginStatus.textContent="sessão forte aberta";upgradeStatus.textContent="sessão forte aberta";setUnlocked();addMessage("system",`Sessão forte ${grant.session.sessionId} aberta até ${new Date(grant.session.expiresAt).toLocaleTimeString()}.`);await refreshState();return true}catch(error){const message=error.name==="NotAllowedError"?"Cerimônia passkey cancelada ou indisponível.":error.message;passkeyLoginStatus.textContent=message;upgradeStatus.textContent=message;if(error.status===401)setLocked("passkey rejeitada");return false}
}

byId("unlock-form").addEventListener("submit",async(event)=>{
  event.preventDefault();unlockError.textContent="";const code=byId("unlock-code").value.trim();if(!code)return;
  try{const grant=await fetchJson("/api/unlock",{method:"POST",body:{code},unlock:true});creatorToken=grant.token;sessionStorage.setItem("arca.creator.session",creatorToken);byId("unlock-code").value="";setUnlocked();addMessage("system",`Sessão ${grant.session.sessionId} aberta até ${new Date(grant.session.expiresAt).toLocaleTimeString()}.`);await refreshState()}catch(error){unlockError.textContent=error.message}
});

byId("passkey-login").addEventListener("click",passkeyLogin);
byId("passkey-upgrade-button").addEventListener("click",passkeyLogin);

byId("passkey-enroll").addEventListener("click",async()=>{
  enrollStatus.textContent="";
  try{
    assertLocalhost();if(!supportsPasskeys())throw new Error("Este navegador não oferece WebAuthn/passkeys.");if(!byId("passkey-confirm").checked)throw new Error("Confirme explicitamente o cadastro da primeira passkey.");
    const headers={"X-ARCA-Creator-Passkey":"1","X-ARCA-Creator-Passkey-Enroll":"first"};enrollStatus.textContent="preparando…";const options=await fetchJson("/api/passkeys/register/options",{method:"POST",body:{confirmFirstEnrollment:true},headers});const credential=await navigator.credentials.create({publicKey:registrationPublicKey(options.publicKey)});if(!credential)throw new Error("Nenhuma credencial foi retornada pelo authenticator.");enrollStatus.textContent="verificando…";const label=byId("passkey-label").value.trim();const result=await fetchJson("/api/passkeys/register/verify",{method:"POST",body:{challengeId:options.challengeId,credential:serializeRegistration(credential),confirmFirstEnrollment:true,label:label||undefined},headers});byId("passkey-confirm").checked=false;enrollStatus.textContent="passkey cadastrada";addMessage("system",`Passkey cadastrada${result.credential?.label?` (${result.credential.label})`:""}. O bootstrap continua limitado; troque para uma sessão forte para usar scopes Creator adicionais.`);await refreshState();
  }catch(error){enrollStatus.textContent=error.name==="NotAllowedError"?"Cadastro cancelado ou indisponível.":error.message}
});

byId("passkey-step-up").addEventListener("click",async()=>{
  stepUpStatus.textContent="autenticando…";
  try{const result=await runAuthentication({purpose:"step-up"});stepUpStatus.textContent=`step-up válido desde ${new Date(result.session.stepUpAt).toLocaleTimeString()}`;addMessage("system","Step-up WebAuthn concluído. Ações high-risk ainda exigem confirmação explícita no comando.");await refreshState()}catch(error){stepUpStatus.textContent=error.name==="NotAllowedError"?"Step-up cancelado ou indisponível.":error.message;if(error.status===401)setLocked("sessão expirada")}
});

byId("chat-form").addEventListener("submit",async(event)=>{
  event.preventDefault();const input=byId("message");const message=input.value.trim();if(!message)return;input.value="";addMessage("creator",message);chatStatus.textContent="enviando…";
  try{
    const result=await fetchJson("/api/chat",{method:"POST",body:{message}});
    if(result.status==="pending"){
      addMessage("system",`Solicitação ${result.requestId} persistida; você pode fechar o navegador e retornar depois.`);chatStatus.textContent=`${result.requestId} · ${result.reasoningState||"aguardando"}`;watchPendingChat(result.requestId)
    }else{
      addMessage("arca",semanticOutput(result));chatStatus.textContent=`${result.requestId} · concluído`
    }
    await refreshState()
  }catch(error){addMessage("system",error.code==="ARCA_PRIMARY_UNAVAILABLE"?"O Creator Console está autenticado, mas este host ainda não tem um provedor de raciocínio conectado ao arca-primary.":`Falha: ${error.message}`);chatStatus.textContent=error.code||"erro";if(error.status===401)setLocked("sessão expirada")}
});

byId("workflow-form").addEventListener("submit",async(event)=>{
  event.preventDefault();workflowStatus.textContent="";
  try{
    const requestIdValue=byId("workflow-request-id").value.trim()||`req-workflow-${Date.now()}`;
    const objectiveIdValue=byId("workflow-objective-id").value.trim();
    let steps;try{steps=JSON.parse(byId("workflow-steps").value)}catch{throw new Error("Steps precisam ser JSON válido.")}
    if(!Array.isArray(steps))throw new Error("Steps precisam ser um array JSON.");
    const deadlineRaw=byId("workflow-deadline").value;const executionPolicy={
      maxSubmitAttemptsPerJob:Number(byId("workflow-job-attempts").value),
      maxTotalSubmitAttempts:Number(byId("workflow-total-attempts").value),
      ...(deadlineRaw?{deadlineAt:new Date(deadlineRaw).toISOString()}:{})
    };
    workflowStatus.textContent="compilando capability -> policy -> recipe…";
    const result=await fetchJson("/api/workflows/propose",{method:"POST",body:{requestId:requestIdValue,...(objectiveIdValue?{objectiveId:objectiveIdValue}:{}),steps,executionPolicy}});
    byId("workflow-request-id").value=requestIdValue;
    workflowStatus.textContent=`${result.proposal.proposalId} · ${result.proposal.status}`;
    await refreshWorkflowProposals()
  }catch(error){workflowStatus.textContent=error.message;if(error.status===401)setLocked("sessão expirada")}
});

byId("refresh").addEventListener("click",refreshState);
byId("review-refresh").addEventListener("click",refreshReviews);
byId("workflow-refresh").addEventListener("click",refreshWorkflows);
byId("logout").addEventListener("click",async()=>{try{await fetchJson("/api/logout",{method:"POST",body:{}})}catch{}setLocked();messages.textContent=""});

if(location.hostname!=="localhost")passkeyLoginStatus.textContent="passkeys exigem localhost";else if(!supportsPasskeys())passkeyLoginStatus.textContent="WebAuthn indisponível neste navegador";
if(creatorToken)refreshState();else setLocked();
