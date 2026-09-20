import {createHash} from "node:crypto";

export const ARCA_SECURITY_CONTROL_CATALOG_FORMAT="arca-security-control-catalog-v1";
export const ARCA_SECURITY_SELF_AUDIT_FORMAT="arca-security-self-audit-v1";
export const ARCA_SECURITY_DASHBOARD_FORMAT="arca-security-dashboard-v1";

const PROFILE_SET=new Set(["local-offline","self-hosted","public-hosted"]);
const STATUS_SET=new Set(["pass","attention","deployment-required","not-assessed","not-implemented","not-applicable"]);
const SEVERITY_SET=new Set(["info","low","medium","high","critical"]);

function plain(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v))}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(plain(v)){const out={};for(const k of Object.keys(v).sort())if(v[k]!==undefined)out[k]=canonical(v[k]);return out}return v}
function hash(v){return createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex")}
function iso(v=new Date().toISOString()){const d=new Date(v);if(Number.isNaN(d.getTime()))throw new TypeError("timestamp invalido");return d.toISOString()}
function normalizeProfile(v){const p=String(v??"local-offline").trim();if(!PROFILE_SET.has(p))throw new TypeError("deploymentProfile invalido");return p}

const CONTROLS=Object.freeze([
  {id:"credential.encrypted-at-rest",domain:"credentials",title:"Credenciais cifradas em repouso",description:"Persistencia de credenciais usa cofre cifrado e nao texto claro.",baseline:"implemented",severity:"high",evidence:["packages/agent/src/credential-vault.ts","tests/credential-vault.test.mjs"]},
  {id:"credential.broker-boundary",domain:"credentials",title:"Credential Broker",description:"Credenciais sao materializadas apenas no limite de transporte necessario.",baseline:"implemented",severity:"high",evidence:["packages/agent/src/credential-vault.ts","packages/agent/src/gateway.ts"]},
  {id:"credential.os-backed-key",domain:"credentials",title:"Armazenamento de chave apoiado pelo SO",description:"Android Keystore, TPM, Secure Enclave ou secret manager equivalente.",baseline:"roadmap",severity:"medium",evidence:[]},
  {id:"credential.ephemeral-use-once",domain:"credentials",title:"Credencial efemera use-once",description:"Uso temporario sem persistencia da credencial.",baseline:"roadmap",severity:"low",evidence:[]},
  {id:"network.external-default-deny",domain:"network",title:"Rede externa default-deny",description:"Conexoes externas exigem configuracao explicita e allowlist.",baseline:"implemented",severity:"high",evidence:["packages/agent/src/gateway.ts","tests/agent-gateway.test.mjs"]},
  {id:"machine-bridge.closed-actions",domain:"execution",title:"Machine Bridge com Action Registry fechado",description:"Jobs remotos nao fornecem shell arbitrario como comando de rede.",baseline:"implemented",severity:"critical",evidence:["docs/MACHINE_BRIDGE_SPECIFICATION_v0.1.md"]},
  {id:"capability.verification-separated",domain:"execution",title:"Capability declarada separada de verificada",description:"Participantes nao podem se autodeclarar verificados.",baseline:"implemented",severity:"medium",evidence:["packages/agent/src/capability-registry.ts","tests/capability-registry.test.mjs"]},
  {id:"custody.acquire-before-infer",domain:"evidence",title:"Aquisicao antes de inferencia",description:"Material probatorio e capturado e custodiado antes de parsing/analise quando aplicavel.",baseline:"implemented",severity:"critical",evidence:["packages/acquisition","packages/pncp-connector"]},
  {id:"privacy.classification",domain:"privacy",title:"Privacy Classification",description:"Dados sao classificados antes de exposicao publica.",baseline:"implemented",severity:"high",evidence:["packages/agent/src/privacy-classification.ts","tests/privacy-publication-gate.test.mjs"]},
  {id:"privacy.publication-gate",domain:"privacy",title:"Publication Gate",description:"Publicacao pode ser liberada, redigida, retida ou rejeitada.",baseline:"implemented",severity:"critical",evidence:["packages/agent/src/publication-gate.ts","tests/privacy-publication-gate.test.mjs"]},
  {id:"privacy.subject-request-hold",domain:"privacy",title:"Hold por contestacao ativa",description:"Contestacoes/correcoes ativas podem impedir republicacao automatica.",baseline:"implemented",severity:"high",evidence:["packages/agent/src/data-subject-requests.ts","tests/legal-basis-dispute-receipt.test.mjs"]},
  {id:"privacy.redaction-receipt",domain:"privacy",title:"Recibo de redacao",description:"Exportacoes redigidas podem ser vinculadas por hashes sem guardar valores removidos.",baseline:"implemented",severity:"medium",evidence:["packages/agent/src/redaction-export-receipt.ts"]},
  {id:"privacy.redaction-engine",domain:"privacy",title:"Motor de redacao de documentos",description:"Aplicacao material de redacoes em formatos arbitrarios ainda nao existe.",baseline:"roadmap",severity:"high",evidence:[]},
  {id:"retention.policy-engine",domain:"lifecycle",title:"Retention Engine",description:"Politicas e avaliacoes de retencao sao auditaveis e nao apagam automaticamente.",baseline:"implemented",severity:"high",evidence:["packages/agent/src/retention-policy.ts","tests/retention-incident-ripd.test.mjs"]},
  {id:"retention.deletion-executor",domain:"lifecycle",title:"Executor seguro de delecao",description:"Execucao fisica de delecao ainda nao esta implementada.",baseline:"roadmap",severity:"high",evidence:[]},
  {id:"retention.deletion-proof",domain:"lifecycle",title:"Comprovante de delecao",description:"Prova auditavel de delecao ainda nao esta implementada.",baseline:"roadmap",severity:"medium",evidence:[]},
  {id:"incident.registry",domain:"incident",title:"Security Incident Registry",description:"Incidentes podem ser registrados e avaliados antes de decisao de comunicacao.",baseline:"implemented",severity:"critical",evidence:["packages/agent/src/security-incidents.ts","tests/retention-incident-ripd.test.mjs"]},
  {id:"ripd.assistant",domain:"governance",title:"RIPD Assistant",description:"Sinais de alto risco e lacunas documentais sao avaliados sem parecer juridico automatico.",baseline:"implemented",severity:"medium",evidence:["packages/agent/src/ripd-assistant.ts","tests/retention-incident-ripd.test.mjs"]},
  {id:"deployment.tls",domain:"deployment",title:"TLS em implantacao hospedada",description:"Depende da infraestrutura real do operador.",baseline:"deployment",severity:"critical",assertion:"tlsEnabled",profiles:["self-hosted","public-hosted"],evidence:[]},
  {id:"deployment.infrastructure-inventory",domain:"deployment",title:"Inventario real de dados da infraestrutura",description:"Mapeia servidor, CDN, proxy, WAF, logs, cookies e terceiros.",baseline:"deployment",severity:"high",assertion:"infrastructureInventoryComplete",profiles:["self-hosted","public-hosted"],evidence:[]},
  {id:"deployment.log-retention",domain:"deployment",title:"Retencao de logs documentada",description:"Politica de logs operacionais deve ter finalidade e periodo definidos.",baseline:"deployment",severity:"medium",assertion:"logRetentionDocumented",profiles:["self-hosted","public-hosted"],evidence:[]},
  {id:"deployment.privacy-notice",domain:"deployment",title:"Aviso de privacidade coerente com fluxo real",description:"Necessario quando a implantacao efetivamente processa dados pessoais de usuarios/visitantes.",baseline:"deployment",severity:"high",assertion:"privacyNoticePublished",profiles:["public-hosted"],evidence:[]},
  {id:"deployment.subject-rights-contact",domain:"deployment",title:"Canal para direitos/correcoes",description:"Implantacao publica deve oferecer canal funcional para contestacoes e correcoes.",baseline:"deployment",severity:"high",assertion:"subjectRightsContactPath",profiles:["public-hosted"],evidence:[]},
  {id:"deployment.incident-owner",domain:"deployment",title:"Responsavel operacional por incidentes",description:"Implantacao hospedada deve possuir responsavel/processo de resposta.",baseline:"deployment",severity:"high",assertion:"incidentResponseOwnerAssigned",profiles:["self-hosted","public-hosted"],evidence:[]},
  {id:"deployment.access-control",domain:"deployment",title:"Controle de acesso documentado",description:"Ambientes compartilhados devem documentar quem acessa investigacoes e segredos.",baseline:"deployment",severity:"high",assertion:"accessControlDocumented",profiles:["self-hosted","public-hosted"],evidence:[]},
  {id:"deployment.backup-protection",domain:"deployment",title:"Backups protegidos e inventariados",description:"Backups podem reter evidencias, dados pessoais e credenciais cifradas.",baseline:"deployment",severity:"medium",assertion:"backupProtectionDocumented",profiles:["self-hosted","public-hosted"],evidence:[]}
]);

export function getSecurityControlCatalog(){
  const payload={format:ARCA_SECURITY_CONTROL_CATALOG_FORMAT,legalComplianceConclusion:false,automatedLegalConclusion:false,controls:clone(CONTROLS)};
  return Object.freeze({...payload,catalogHash:hash(payload)});
}

export function verifySecurityControlCatalog(value){if(!plain(value)||value.format!==ARCA_SECURITY_CONTROL_CATALOG_FORMAT)return false;const {catalogHash,...payload}=value;return typeof catalogHash==="string"&&catalogHash===hash(payload)}

function deploymentStatus(control,profile,assertions){
  if(Array.isArray(control.profiles)&&!control.profiles.includes(profile))return {status:"not-applicable",reason:"profile-not-applicable"};
  const value=assertions?.[control.assertion];
  if(value===true)return {status:"pass",reason:"deployment-assertion-confirmed"};
  if(value===false)return {status:"attention",reason:"deployment-assertion-failed"};
  return {status:"deployment-required",reason:"deployment-assertion-required"};
}

export function runSecuritySelfAudit(input={},options={}){
  if(!plain(input))throw new TypeError("self audit input invalido");
  const profile=normalizeProfile(input.deploymentProfile);
  const assertions=plain(input.assertions)?input.assertions:{};
  const controls=CONTROLS.map(control=>{
    let state;
    if(control.baseline==="implemented")state={status:"pass",reason:"implemented-and-covered-by-project-evidence"};
    else if(control.baseline==="roadmap")state={status:"not-implemented",reason:"roadmap-item"};
    else state=deploymentStatus(control,profile,assertions);
    if(!STATUS_SET.has(state.status)||!SEVERITY_SET.has(control.severity))throw new Error("control status invalido");
    return {...clone(control),...state};
  });
  const counts=Object.fromEntries([...STATUS_SET].map(s=>[s,controls.filter(c=>c.status===s).length]));
  const blocking=controls.filter(c=>["critical","high"].includes(c.severity)&&["attention","deployment-required","not-implemented"].includes(c.status)).map(c=>c.id);
  const payload={
    format:ARCA_SECURITY_SELF_AUDIT_FORMAT,
    deploymentProfile:profile,
    counts,
    blockingIssues:blocking,
    controls,
    legalComplianceConclusion:false,
    automatedLegalConclusion:false,
    complianceScoreProduced:false,
    auditedAt:iso(options.auditedAt)
  };
  return Object.freeze({...payload,auditHash:hash(payload)});
}

export function verifySecuritySelfAudit(value){if(!plain(value)||value.format!==ARCA_SECURITY_SELF_AUDIT_FORMAT)return false;const {auditHash,...payload}=value;return typeof auditHash==="string"&&auditHash===hash(payload)}

const DOMAIN_LABELS={credentials:"Credenciais",network:"Rede",execution:"Execucao",evidence:"Evidencia e custodia",privacy:"Privacidade e publicacao",lifecycle:"Ciclo de vida",incident:"Incidentes",governance:"Governanca",deployment:"Implantacao"};

export function buildSecurityDashboardModel(audit){
  if(!verifySecuritySelfAudit(audit))throw new Error("self audit invalido ou adulterado");
  const domains=[...new Set(audit.controls.map(c=>c.domain))];
  const sections=domains.map(domain=>({
    id:domain,
    label:DOMAIN_LABELS[domain]??domain,
    controls:audit.controls.filter(c=>c.domain===domain).map(c=>({id:c.id,title:c.title,description:c.description,status:c.status,severity:c.severity,reason:c.reason,evidence:c.evidence??[]}))
  }));
  const summaryCards=[
    {id:"pass",label:"Controles tecnicos confirmados",value:audit.counts.pass,state:"good"},
    {id:"attention",label:"Atencao requerida",value:audit.counts.attention,state:"warning"},
    {id:"deployment",label:"Dependem da implantacao",value:audit.counts["deployment-required"],state:"info"},
    {id:"roadmap",label:"Ainda nao implementados",value:audit.counts["not-implemented"],state:"warning"}
  ];
  const payload={
    format:ARCA_SECURITY_DASHBOARD_FORMAT,
    sourceAuditHash:audit.auditHash,
    deploymentProfile:audit.deploymentProfile,
    summaryCards,
    sections,
    filters:{statuses:[...STATUS_SET],severities:[...SEVERITY_SET],domains},
    disclaimers:["Este painel mede controles tecnicos e declaracoes de implantacao; nao certifica conformidade juridica.","PASS significa que o controle tecnico catalogado esta implementado/evidenciado no baseline, nao que todo uso concreto e legal."],
    legalComplianceConclusion:false,
    complianceScoreProduced:false,
    generatedAt:audit.auditedAt
  };
  return Object.freeze({...payload,dashboardHash:hash(payload)});
}

export function verifySecurityDashboardModel(value){if(!plain(value)||value.format!==ARCA_SECURITY_DASHBOARD_FORMAT)return false;const {dashboardHash,...payload}=value;return typeof dashboardHash==="string"&&dashboardHash===hash(payload)}
