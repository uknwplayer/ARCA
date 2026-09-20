# ARCA Agent Gateway v1

**Status:** backend foundation

## Objetivo

O ARCA mantém um único agente principal interno (`arca-primary`) como coordenador. Agentes ou modelos externos são opcionais e entram apenas como capacidades adicionais fornecidas pelo usuário.

Não existe dependência obrigatória de OpenAI, Anthropic, Google, Ollama, Replit, VPS ou outro fornecedor.

## Separação de papéis

- **ARCA Agent**: coordenador lógico principal.
- **External Agent**: inteligência opcional conectada pelo usuário.
- **Worker**: ambiente de execução de ações Machine Bridge.
- **Tool/Connector**: capacidade concreta, como PNCP, AIE ou aquisição.
- **Credential Vault**: armazenamento cifrado de credenciais no host.
- **Credential Broker**: único limite autorizado a apresentar uma credencial ao provedor durante uma requisição autenticada.

Agente externo não recebe shell irrestrito nem autoridade direta sobre o Core.

## Agent Registry

O backend registra agentes com `id`, `provider`, `kind`, `capabilities`, prioridade e indicação opcional de principal. Somente um agente pode ser principal. O factory padrão cria `arca-primary` com prioridade máxima.

A seleção é feita por capabilities. Agentes externos só entram no roteamento quando a chamada define explicitamente `allowExternal: true`.

## Conexões externas e credenciais

O contrato v1 suporta `none`, `bearer`, `api-key` e `oauth2`.

O Registry nunca recebe senha, token ou chave bruta. Ele guarda somente `credentialRef`, por exemplo:

```json
{
  "endpoint": "https://agent.example",
  "auth": {
    "mode": "oauth2",
    "credentialRef": "vault://agents/example"
  }
}
```

Conexões autenticadas exigem um `Credential Broker`. O Gateway não aceita mais um resolver que devolva a chave em texto. O Broker abre a credencial cifrada apenas no limite de transporte e acrescenta o header de autenticação à requisição.

O backend rejeita campos como `token`, `apiKey`, `password`, `clientSecret` e `Authorization` dentro do descriptor.

### Limite de privacidade honesto

O ARCA Agent e o Core não precisam receber a credencial. Entretanto, nenhum sistema que use uma API key pode afirmar honestamente que o segredo nunca existe em memória: no momento de uma chamada autenticada, o componente de transporte precisa apresentar o segredo ao provedor. O desenho reduz essa exposição ao Broker e limpa buffers mutáveis quando possível.

O objetivo verificável é:

1. nenhum segredo persistido em texto;
2. nenhum segredo em Registry, jobs, resultados, relatórios ou logs de auditoria;
3. chave mestra fora do armazenamento do cofre;
4. descriptografia apenas just-in-time no Broker;
5. auditoria sem revelar a chave.

Veja `docs/ARCA_CREDENTIAL_SECURITY_V1.md`.

## Protocolo HTTP AAP v1

Um agente compatível expõe:

### `GET /arca/agent`

```json
{
  "format": "arca-agent-descriptor-v1",
  "id": "meu-agente",
  "name": "Meu Agente",
  "provider": "custom",
  "capabilities": ["research", "summarization"]
}
```

### `POST /arca/jobs`

Entrada:

```json
{
  "format": "arca-agent-task-v1",
  "taskId": "TASK-1",
  "task": "Resuma o material fornecido.",
  "requiredCapabilities": ["summarization"],
  "context": {},
  "humanReviewRequired": true
}
```

Saída esperada:

```json
{
  "format": "arca-agent-result-v1",
  "taskId": "TASK-1",
  "status": "completed",
  "output": {},
  "humanReviewRequired": true
}
```

## Linkamento

`linkExternalAgent(...)` executa handshake no endpoint remoto antes de registrar o agente. O backend confirma protocolo reconhecido, identidade remota, capabilities anunciadas, política de rede do host e método de autenticação por `credentialRef`.

## Política de rede

Rede externa é bloqueada por padrão. O host precisa fornecer `networkEnabled: true`, `allowedOrigins` para endpoints remotos ou `allowLoopback: true` para modelos locais.

HTTP sem TLS só é aceito em loopback local. Redirecionamentos HTTP são recusados. Essa política reduz risco de SSRF e evita que um descriptor controle livremente o egress do host.

## Autoridade

Toda resposta do Gateway retorna `humanReviewRequired: true` e `coreMutationPerformed: false`.

O resultado de um agente externo pode alimentar propostas ARCA, análise ou planejamento, mas não altera diretamente a investigação canônica. O fluxo de proposta, revisão humana e validação do Core permanece separado.

## Escopo atual

Incluído:

- Registry interno/externo;
- ARCA principal único;
- roteamento por capability;
- handshake/linkamento;
- API HTTP genérica;
- `credentialRef`;
- Credential Vault cifrado;
- Credential Broker opaco para chamadas autenticadas;
- allowlist de rede;
- suporte estrutural a API key, bearer e OAuth2;
- suporte a agente local via loopback;
- trilha de auditoria de credenciais sem plaintext.

Não incluído ainda:

- frontend;
- tela de login;
- implementação específica de OAuth de fornecedores;
- adaptadores diretos OpenAI/Anthropic/Gemini/etc.;
- billing;
- descoberta pública de agentes;
- concessão automática de ferramentas Machine Bridge a modelos externos.
