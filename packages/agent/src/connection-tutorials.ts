export const ARCA_AGENT_CONNECTION_TUTORIAL_FORMAT="arca-agent-connection-tutorial-v1";

const MODE_ORDER=["cloud-api","local-api","custom-aap","oauth2"];
const BACKEND_SUPPORT=new Set(["direct","provider-adapter-required","auth-flow-adapter-required"]);

const rawTutorials=[
  {
    id:"openai-api",
    mode:"cloud-api",
    provider:"openai",
    label:"OpenAI / GPT API",
    authMode:"bearer",
    apiKeyRequired:true,
    keyCreationUrl:"https://platform.openai.com/api-keys",
    docsUrl:"https://platform.openai.com/docs/api-reference/authentication",
    serviceUrl:"https://api.openai.com/v1",
    backendSupport:"provider-adapter-required",
    adapterId:"openai",
    steps:[
      "Abra a pagina oficial de API keys da OpenAI e entre na conta que pagara ou controlara o uso da API.",
      "Crie uma nova API key no projeto correto e copie a chave no momento da criacao.",
      "Salve a chave no cofre de credenciais do host ARCA; o Registry deve receber apenas um credentialRef, nunca a chave em texto.",
      "Selecione o adaptador OpenAI quando ele estiver habilitado no backend e teste a conexao antes de autorizar tarefas reais."
    ],
    notes:["A assinatura do ChatGPT e a cobranca da API sao produtos separados.","Nunca coloque a API key em frontend, job, log ou repositorio Git."]
  },
  {
    id:"anthropic-claude-api",
    mode:"cloud-api",
    provider:"anthropic",
    label:"Anthropic / Claude API",
    authMode:"api-key",
    apiKeyRequired:true,
    keyCreationUrl:"https://platform.claude.com/settings/keys",
    docsUrl:"https://docs.anthropic.com/en/api/getting-started",
    serviceUrl:"https://api.anthropic.com",
    backendSupport:"provider-adapter-required",
    adapterId:"anthropic",
    steps:[
      "Abra o Claude Platform, entre na conta e acesse a area de API keys.",
      "Crie uma chave para o workspace/projeto que sera usado pelo ARCA e copie a credencial.",
      "Guarde a chave no cofre de credenciais do host e associe somente o credentialRef ao cadastro do agente.",
      "Selecione o adaptador Anthropic quando ele estiver habilitado e execute um teste de conexao antes do uso investigativo."
    ],
    notes:["A API da Anthropic usa credencial propria; nao reutilize senha de login.","A chave nao deve aparecer em prompts, relatorios ou commits."]
  },
  {
    id:"google-gemini-api",
    mode:"cloud-api",
    provider:"google",
    label:"Google Gemini API",
    authMode:"api-key",
    apiKeyRequired:true,
    keyCreationUrl:"https://aistudio.google.com/app/apikey",
    docsUrl:"https://ai.google.dev/gemini-api/docs/api-key",
    serviceUrl:"https://generativelanguage.googleapis.com",
    backendSupport:"provider-adapter-required",
    adapterId:"google-gemini",
    steps:[
      "Abra a pagina de API keys do Google AI Studio e entre com a conta Google que controlara o projeto.",
      "Crie uma nova API key vinculada ao projeto desejado e aplique as restricoes recomendadas pelo Google.",
      "Armazene a chave no cofre de credenciais do host ARCA e use somente um credentialRef no Registry.",
      "Selecione o adaptador Gemini quando ele estiver habilitado e valide a conexao antes de liberar tarefas."
    ],
    notes:["O Google alterou o modelo de chaves em 2026; siga sempre a pagina oficial indicada no tutorial.","Nao exponha a chave em codigo cliente ou frontend."]
  },
  {
    id:"openrouter-api",
    mode:"cloud-api",
    provider:"openrouter",
    label:"OpenRouter API",
    authMode:"bearer",
    apiKeyRequired:true,
    keyCreationUrl:"https://openrouter.ai/settings/keys",
    docsUrl:"https://openrouter.ai/docs/quickstart",
    serviceUrl:"https://openrouter.ai/api/v1",
    backendSupport:"provider-adapter-required",
    adapterId:"openrouter",
    steps:[
      "Entre no OpenRouter e abra a area de chaves da sua workspace.",
      "Crie uma API key e, se desejar, configure limites de gasto antes de copiar a chave.",
      "Salve a chave no cofre de credenciais do host ARCA e mantenha apenas o credentialRef no cadastro.",
      "Selecione o adaptador OpenRouter quando ele estiver habilitado e teste o modelo escolhido."
    ],
    notes:["OpenRouter pode rotear varios modelos por uma unica API; custos e limites dependem do modelo/provedor escolhido.","A chave e um segredo Bearer e nao deve ser enviada ao Core."]
  },
  {
    id:"ollama-cloud-api",
    mode:"cloud-api",
    provider:"ollama",
    label:"Ollama Cloud API",
    authMode:"bearer",
    apiKeyRequired:true,
    keyCreationUrl:"https://ollama.com/settings/keys",
    docsUrl:"https://docs.ollama.com/api/authentication",
    serviceUrl:"https://ollama.com/api",
    backendSupport:"provider-adapter-required",
    adapterId:"ollama",
    steps:[
      "Entre em ollama.com e abra as configuracoes de API keys.",
      "Crie uma API key para acesso programatico aos modelos cloud e copie a chave.",
      "Guarde a chave no cofre de credenciais do host e use um credentialRef no ARCA.",
      "Selecione o adaptador Ollama Cloud quando ele estiver habilitado e teste a conexao."
    ],
    notes:["Ollama local e Ollama Cloud sao modos diferentes; o modo local normalmente nao precisa de API key."]
  },
  {
    id:"ollama-local",
    mode:"local-api",
    provider:"ollama",
    label:"Ollama local",
    authMode:"none",
    apiKeyRequired:false,
    keyCreationUrl:null,
    docsUrl:"https://docs.ollama.com/api/introduction",
    serviceUrl:"http://localhost:11434/api",
    backendSupport:"provider-adapter-required",
    adapterId:"ollama",
    steps:[
      "Instale o Ollama no computador que executara o modelo e baixe o modelo desejado.",
      "Inicie o Ollama; a API local fica disponivel por padrao em http://localhost:11434/api.",
      "Mantenha o endpoint em loopback sempre que possivel; nao exponha a porta na internet sem uma camada de seguranca adequada.",
      "No ARCA, use o adaptador Ollama local quando ele estiver habilitado e faca um teste antes de delegar tarefas."
    ],
    notes:["A API local do Ollama nao exige autenticacao por padrao.","O Agent Gateway atual exige autorizacao explicita do host para endpoints loopback."]
  },
  {
    id:"lm-studio-local",
    mode:"local-api",
    provider:"lm-studio",
    label:"LM Studio local",
    authMode:"none",
    apiKeyRequired:false,
    keyCreationUrl:null,
    docsUrl:"https://lmstudio.ai/docs/developer/rest/quickstart",
    serviceUrl:"http://localhost:1234",
    backendSupport:"provider-adapter-required",
    adapterId:"lm-studio",
    steps:[
      "Instale o LM Studio, baixe um modelo compativel e carregue-o.",
      "Abra a area Developer e inicie o servidor local; por padrao ele pode usar http://localhost:1234.",
      "Deixe o servidor restrito ao localhost sempre que possivel; se habilitar acesso de rede, ative autenticacao e controle o host autorizado.",
      "No ARCA, use o adaptador LM Studio quando ele estiver habilitado e valide a conexao."
    ],
    notes:["O LM Studio nao exige autenticacao local por padrao, mas permite habilitar token no servidor.","Ele oferece APIs REST e endpoints compativeis com formatos de outros provedores."]
  },
  {
    id:"custom-aap-agent",
    mode:"custom-aap",
    provider:"custom",
    label:"Agente proprio compativel com AAP",
    authMode:"configurable",
    supportedAuthModes:["none","bearer","api-key","oauth2"],
    apiKeyRequired:false,
    keyCreationUrl:null,
    docsUrl:null,
    serviceUrl:null,
    backendSupport:"direct",
    adapterId:null,
    steps:[
      "Disponibilize um endpoint HTTPS para o agente, ou um endpoint HTTP somente em localhost quando o host ARCA permitir loopback.",
      "Implemente GET /arca/agent retornando um descriptor arca-agent-descriptor-v1 com id, provider e capabilities.",
      "Implemente POST /arca/jobs para receber arca-agent-task-v1 e retornar arca-agent-result-v1 com humanReviewRequired=true.",
      "Escolha o modo de autenticacao apropriado e cadastre apenas o credentialRef; nunca envie o segredo dentro do descriptor.",
      "Adicione a origem na allowlist do host, execute o handshake e somente depois autorize allowExternal para tarefas reais."
    ],
    notes:["Este e o unico modo deste catalogo que o Agent Gateway v1 executa diretamente hoje.","Agentes externos nunca recebem autoridade direta sobre o Core nem shell irrestrito."]
  },
  {
    id:"oauth2-provider",
    mode:"oauth2",
    provider:"generic",
    label:"Conexao por OAuth 2.0",
    authMode:"oauth2",
    apiKeyRequired:false,
    keyCreationUrl:null,
    docsUrl:null,
    serviceUrl:null,
    backendSupport:"auth-flow-adapter-required",
    adapterId:null,
    steps:[
      "Escolha um provedor que ofereca OAuth 2.0 para integracoes de terceiros e consulte a documentacao oficial desse provedor.",
      "Registre o aplicativo ARCA/host no provedor e configure a URL de callback exigida pelo fluxo OAuth.",
      "Autorize a conta no proprio site do provedor; o usuario nao deve informar a senha ao ARCA.",
      "Armazene access/refresh tokens no cofre de credenciais do host e exponha ao Registry somente um credentialRef.",
      "Conclua o teste do adaptador OAuth do provedor antes de liberar tarefas externas."
    ],
    notes:["O Gateway reconhece oauth2 como modo de autenticacao, mas cada provedor precisa de um adaptador de login/refresh proprio.","Nunca implemente OAuth coletando usuario e senha do provedor dentro do ARCA."]
  }
];

function clone(value){return JSON.parse(JSON.stringify(value))}
function validateTutorial(tutorial){
  if(!tutorial||typeof tutorial!=="object")throw new TypeError("tutorial invalido");
  if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(tutorial.id))throw new TypeError(`tutorial id invalido: ${tutorial.id}`);
  if(!MODE_ORDER.includes(tutorial.mode))throw new Error(`modo de tutorial nao suportado: ${tutorial.mode}`);
  if(!BACKEND_SUPPORT.has(tutorial.backendSupport))throw new Error(`backendSupport invalido: ${tutorial.backendSupport}`);
  if(!Array.isArray(tutorial.steps)||tutorial.steps.length<3)throw new Error(`tutorial sem passos suficientes: ${tutorial.id}`);
  if(tutorial.apiKeyRequired===true&&!tutorial.keyCreationUrl)throw new Error(`tutorial de API key sem link de criacao: ${tutorial.id}`);
  for(const key of ["keyCreationUrl","docsUrl"]){
    const value=tutorial[key];if(value!==null&&value!==undefined){const url=new URL(value);if(url.protocol!=="https:")throw new Error(`${key} deve usar HTTPS em ${tutorial.id}`)}
  }
  if(tutorial.serviceUrl){const url=new URL(tutorial.serviceUrl);if(url.protocol!=="https:"&&!(["localhost","127.0.0.1","::1"].includes(url.hostname)&&url.protocol==="http:"))throw new Error(`serviceUrl insegura em ${tutorial.id}`)}
  return Object.freeze({...clone(tutorial),format:ARCA_AGENT_CONNECTION_TUTORIAL_FORMAT});
}

const CATALOG=Object.freeze(rawTutorials.map(validateTutorial));
const BY_ID=new Map(CATALOG.map(item=>[item.id,item]));

export function listAgentConnectionModes(){
  return MODE_ORDER.map(mode=>({mode,count:CATALOG.filter(item=>item.mode===mode).length}));
}

export function listAgentConnectionTutorials(filters={}){
  const mode=filters.mode?String(filters.mode):null;
  const provider=filters.provider?String(filters.provider).toLowerCase():null;
  const backendSupport=filters.backendSupport?String(filters.backendSupport):null;
  if(mode&&!MODE_ORDER.includes(mode))throw new Error(`modo desconhecido: ${mode}`);
  if(backendSupport&&!BACKEND_SUPPORT.has(backendSupport))throw new Error(`backendSupport desconhecido: ${backendSupport}`);
  return CATALOG.filter(item=>(!mode||item.mode===mode)&&(!provider||item.provider.toLowerCase()===provider)&&(!backendSupport||item.backendSupport===backendSupport)).map(clone);
}

export function getAgentConnectionTutorial(id){
  const tutorial=BY_ID.get(String(id));return tutorial?clone(tutorial):null;
}
