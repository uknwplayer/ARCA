# ARCA — Guia geral de comandos no Termux

Versão: **V0.2**  
Atualizado em: **2026-10-03**  
Ambiente principal: **Android + Termux**  
Repositório: `uknwplayer/ARCA`

Este documento reúne os comandos de operação do ARCA no Termux. Execute-os a partir do repositório, salvo indicação contrária.

```bash
cd ~/ARCA
```

> O trabalho Vince/Edge/Runtime móvel continua congelado no caminho crítico. Os comandos Vince abaixo existem e permanecem documentados, mas não reativam essa frente por si só.

## 1. Diagnóstico e Git

```bash
node scripts/arca-vince-v41-termux.mjs doctor
node scripts/arca-vince-v41-termux.mjs --help
git status
git fetch
git pull --ff-only
gh auth status
gh pr list
gh run list --limit 10
```

O `doctor` verifica Node.js, Git, `gh` e autenticação GitHub.

## 2. Vince/Termux existente

```bash
node scripts/arca-vince-v41-termux.mjs init-identity
node scripts/arca-vince-v41-termux.mjs init-identity --node-id meu-worker
node scripts/arca-vince-v41-termux.mjs show-identity
node scripts/arca-vince-v41-termux.mjs publish-identity
node scripts/arca-vince-v41-termux.mjs once --job-id ID_DA_TAREFA
```

A identidade é Ed25519 e a chave privada deve permanecer local. O worker V4.1 é one-shot; esse script não oferece daemon permanente.

## 3. ARCA Core CLI

```bash
npm run arca -- help
npm run arca -- init
npm run arca -- list
npm run arca -- investigation create \
  --question "Pergunta" \
  --objective "Objetivo" \
  --scope "Escopo" \
  --limits "Limites"
npm run arca -- investigation show --investigation INV-000001
npm run arca -- investigation status --investigation INV-000001
npm run arca -- validate --investigation INV-000001
npm run arca -- trace --investigation INV-000001 --target CON-000001
npm run arca -- export --investigation INV-000001 --out investigacao.arca.json
```

Outros comandos do Core continuam disponíveis para adicionar/atualizar objetos, relacionar, invalidar, reavaliar e fechar/reabrir conclusões. Use `npm run arca -- help` como fonte operacional.

## 4. Demonstração, Workbench e Creator

```bash
npm run demo
npm run workbench
npm run creator
```

Workbench padrão: `http://127.0.0.1:4317`. Não exponha o modo remoto diretamente à internet sem uma camada própria de autenticação.

O Creator Console possui infraestrutura de chat/gateway, mas o launcher standalone não ganha automaticamente um provedor de raciocínio.

## 5. Machine Bridge e revisão

```bash
npm run remote:submit -- --help
npm run remote:call -- --help
npm run review:wake -- --once
npm run review:wake
npm run review:sync
```

Exemplo de chamada Machine Bridge:

```bash
npm run remote:call -- \
  --repo uknwplayer/ARCA \
  --action worker.ping
```

Pode exigir `ARCA_GITHUB_TOKEN` ou `GITHUB_TOKEN`. Nunca grave tokens no repositório.

## 6. ChatGPT Work Execution Endpoint

```bash
npm run work:endpoint -- heartbeat
npm run work:endpoint -- wake --job ./job.json
npm run work:endpoint -- ack --wake-id HASH_DO_WAKE
npm run work:endpoint -- result --job-id ID_DA_TAREFA --request-id ID_DA_REQUISICAO
```

`wake` não significa claim, execução ou autoridade. Essa ponte event-driven não é um chat interativo do ChatGPT.

## 7. Aquisição e custódia

```bash
npm run acquire
npm run acquire -- verify \
  --home .arca \
  --investigation INV-000001 \
  --acquisition ACQ-000001
```

O binário suporta `capture`, `verify`, `transform`, `review`, `enqueue` e `from-json`. Operações reais devem respeitar os contratos de origem, acesso, custódia e publicação.

## 8. Testes e saúde

```bash
npm test
npm run check
npm run check:public
npm run test:core
npm run test:agent
npm run test:workbench
npm run test:pncp
```

Validadores M5 disponíveis incluem:

```bash
npm run validate:m5-phase-a
npm run validate:m5-phase-b
npm run validate:m5-phase-c
npm run validate:m5-phase-d
npm run validate:m5-phase-e
npm run validate:m5-correlation-readiness
npm run validate:m5-private-screening-contract
npm run validate:m5-n1-item-discovery
npm run validate:m5-n1-offline-observation
npm run validate:get-cost-policy
```

Validador verde não concede autoridade externa adicional.

## 9. Conversação pelo Termux

### 9.1 `arca chat` offline — padrão e sem chave

```bash
npm run arca -- chat
```

Esse é o modo padrão. Ele abre a interface do chat e **não faz chamada de rede para modelo**.

Comandos locais:

```text
/status      estado da sessão
/context     contexto ativo
/providers   lista os provedores disponíveis
/clear       limpa o histórico em memória
/help        ajuda
/exit        encerra
```

No modo offline, uma mensagem comum informa que nenhum modelo externo está ativo. Isso permite abrir o console e inspecionar os provedores sem chave e sem budget.

### 9.2 Gemini — provedor externo opt-in

```bash
export GEMINI_API_KEY='SUA_CHAVE'

npm run arca -- chat \
  --provider gemini \
  --allow-external
```

Modelo padrão atual do adaptador Termux:

```text
gemini-2.5-flash
```

Para escolher outro modelo explicitamente:

```bash
npm run arca -- chat \
  --provider gemini \
  --model gemini-2.5-flash \
  --allow-external
```

O catálogo marca Gemini como **elegível a free tier**, mas isso **não é garantia de gratuidade**. Cotas, disponibilidade e eventual cobrança dependem do projeto/conta do Google e podem mudar. O ARCA não faz fallback automático para OpenAI ou outro tier pago.

A sessão Gemini exige `--allow-external`, mantém histórico somente em memória e não recebe ferramentas, shell ou autoridade para alterar o Core.

### 9.3 OpenAI — provedor externo com gate monetário

```bash
export OPENAI_API_KEY='SUA_CHAVE'

npm run arca -- chat \
  --provider openai \
  --model gpt-6-luna \
  --allow-external \
  --allow-paid-api \
  --session-budget-usd 0.05
```

A rota OpenAI preserva os controles existentes:

- `--allow-external` obrigatório;
- `--allow-paid-api` obrigatório;
- budget de sessão explícito;
- modelo com preço conhecido no snapshot;
- estimativa conservadora abaixo do teto.

O budget local é estimativo e não é garantia de limite na fatura do provedor. `/clear` apaga o histórico, mas não restaura budget consumido.

### 9.4 `arca ask` — pergunta única OpenAI

```bash
export OPENAI_API_KEY='SUA_CHAVE'

npm run arca -- ask \
  --message "Onde paramos?" \
  --model gpt-6-luna \
  --allow-external \
  --allow-paid-api \
  --max-request-usd 0.01
```

`arca ask` continua sendo a rota de uma pergunta OpenAI com gate monetário; a mudança multi-provedor deste ciclo é limitada a `arca chat`.

### 9.5 Fronteiras do chat

Em todos os modos atuais do `arca chat`:

- histórico é somente em memória do processo;
- contexto automático de checkpoint/roadmap ainda está desligado;
- zero ferramentas automáticas;
- nenhum shell é concedido ao modelo;
- nenhuma resposta altera o Core;
- não há chamada automática ao Work ou Machine Bridge;
- não há fallback automático de provedor.

O `arca chat` não reutiliza uma conversa da interface de consumidor do ChatGPT; cada provedor usa sua própria rota/API e o ARCA fornece apenas o contexto mantido na sessão local.

Documento técnico: `docs/ARCA_TERMUX_GPT_BRIDGE_V0_1.md`.

## 10. Segredos que nunca devem ser publicados

Nunca cole em commits, issues, README ou logs públicos:

- `ARCA_GITHUB_TOKEN`;
- `GITHUB_TOKEN`;
- `OPENAI_API_KEY`;
- `GEMINI_API_KEY`;
- passphrases de custódia;
- chaves privadas Ed25519;
- secrets do Portal da Transparência;
- conteúdo privado de envelopes de custódia.
