# ARCA — Guia geral de comandos no Termux

Versão: **V0.1**  
Data: **2026-09-24**  
Ambiente principal: **Android + Termux**  
Repositório: `uknwplayer/ARCA`

Este documento reúne os comandos gerais atualmente disponíveis para operar o ARCA pelo Termux. Ele diferencia comandos **existentes hoje** de capacidades **planejadas**, para evitar confundir uma interface futura com algo já implementado.

> Regra importante: execute os comandos a partir do diretório do projeto, salvo indicação contrária.

```bash
cd ~/ARCA
```

---

## 1. Diagnóstico rápido do ambiente

### Verificar Vince/Termux

```bash
node scripts/arca-vince-v41-termux.mjs doctor
```

Verifica:

- versão do Node.js;
- versão do Git;
- versão do GitHub CLI (`gh`);
- estado da autenticação do GitHub.

É o primeiro comando recomendado quando algo deixa de funcionar no Termux.

### Ver ajuda do worker Termux

```bash
node scripts/arca-vince-v41-termux.mjs --help
```

Mostra os comandos oficiais disponíveis no worker Vince V4.1.

---

## 2. Identidade do Vince no celular

### Criar identidade

```bash
node scripts/arca-vince-v41-termux.mjs init-identity
```

Cria uma identidade Ed25519 local para o worker do Termux.

Para escolher um ID:

```bash
node scripts/arca-vince-v41-termux.mjs init-identity --node-id meu-worker
```

A chave privada permanece local e não é impressa.

### Mostrar identidade pública

```bash
node scripts/arca-vince-v41-termux.mjs show-identity
```

Exibe somente os dados públicos da identidade do worker.

### Publicar identidade pública

```bash
node scripts/arca-vince-v41-termux.mjs publish-identity
```

Publica a identidade pública do worker no canal GitHub configurado pelo ARCA.

É possível indicar diretório de identidade e canal explicitamente:

```bash
node scripts/arca-vince-v41-termux.mjs publish-identity \
  --identity-dir ~/.arca/vince-v41-b \
  --channel-repo uknwplayer/ARCA \
  --channel-branch vince-v41-termux-channel
```

---

## 3. Executar uma tarefa recebida pelo Vince

```bash
node scripts/arca-vince-v41-termux.mjs once --job-id ID_DA_TAREFA
```

Executa uma única tarefa remota destinada ao worker Termux e encerra o processo depois.

Também pode indicar explicitamente o projeto e a identidade:

```bash
node scripts/arca-vince-v41-termux.mjs once \
  --job-id ID_DA_TAREFA \
  --repo-path ~/ARCA \
  --identity-dir ~/.arca/vince-v41-b
```

**Estado atual:** V4.1 é one-shot. Não existe modo daemon/serviço permanente nesse script.

---

## 4. ARCA Core CLI

### Ajuda

```bash
npm run arca -- help
```

Exibe a CLI principal do Core.

### Inicializar armazenamento local

```bash
npm run arca -- init
```

Inicializa o diretório local do ARCA.

### Listar investigações

```bash
npm run arca -- list
```

Lista as investigações existentes no armazenamento local.

### Criar investigação

```bash
npm run arca -- investigation create \
  --question "Pergunta da investigação" \
  --objective "Objetivo" \
  --scope "Escopo" \
  --limits "Limites"
```

Cria uma investigação auditável no Core.

### Mostrar investigação

```bash
npm run arca -- investigation show --investigation INV-000001
```

Mostra o estado completo da investigação indicada.

### Ver status

```bash
npm run arca -- investigation status --investigation INV-000001
```

Mostra um resumo operacional da investigação.

### Validar investigação

```bash
npm run arca -- validate --investigation INV-000001
```

Executa as validações estruturais do Core.

### Exportar investigação

```bash
npm run arca -- export \
  --investigation INV-000001 \
  --out investigacao.arca.json
```

Exporta o estado auditável para um arquivo JSON.

### Rastrear relações

```bash
npm run arca -- trace \
  --investigation INV-000001 \
  --target CON-000001
```

Mostra a cadeia de relações que sustenta ou deriva do objeto indicado.

Para descendentes:

```bash
npm run arca -- trace \
  --investigation INV-000001 \
  --target DOC-000001 \
  --direction descendants
```

### Invalidar um objeto

```bash
npm run arca -- invalidate \
  --investigation INV-000001 \
  --id DOC-000001 \
  --reason "Motivo da invalidação"
```

Invalida o objeto mantendo o histórico append-only.

### Reavaliar um objeto

```bash
npm run arca -- reevaluate \
  --investigation INV-000001 \
  --id PRO-000001 \
  --justification "Nova evidência"
```

Reabre a avaliação do objeto indicado.

---

## 5. Demonstração local

```bash
npm run demo
```

Executa um fluxo sintético isolado do Core.

É útil para verificar se o ARCA básico está funcionando sem usar dados externos reais.

---

## 6. Workbench local

```bash
npm run workbench
```

Inicia o Workbench local.

Endereço padrão:

```text
http://127.0.0.1:4317
```

Por padrão o servidor aceita somente conexões locais.

Ajuda:

```bash
npm run workbench -- --help
```

Porta personalizada:

```bash
npm run workbench -- --port 5000
```

**Atenção:** o modo remoto do Workbench não possui autenticação própria. Não exponha diretamente à internet.

---

## 7. Creator Console

```bash
npm run creator
```

Abre o Creator Console local.

Ele possui infraestrutura de chat, sessões, passkeys e gateway de raciocínio, porém o launcher standalone atual **não conecta automaticamente um provedor GPT**.

Ajuda:

```bash
npm run creator -- --help
```

Essa infraestrutura será uma das bases da futura conversação ARCA ↔ GPT pelo Termux.

---

## 8. Machine Bridge

### Enviar tarefa sem aguardar resultado

```bash
npm run remote:submit -- --help
```

Exemplo:

```bash
npm run remote:submit -- \
  --repo uknwplayer/ARCA \
  --action worker.ping
```

O comando cria uma tarefa Machine Bridge e retorna imediatamente.

### Enviar tarefa e aguardar resultado

```bash
npm run remote:call -- --help
```

Exemplo:

```bash
npm run remote:call -- \
  --repo uknwplayer/ARCA \
  --action worker.ping
```

O `remote:call` cria a tarefa, acompanha o resultado e retorna o estado final.

### Credencial GitHub

Os comandos GitHub Machine Bridge podem exigir:

```bash
export ARCA_GITHUB_TOKEN='TOKEN'
```

ou `GITHUB_TOKEN`.

**Nunca grave tokens no repositório, README, scripts públicos ou commits.**

---

## 9. Revisão humana

### Executar o observador uma vez

```bash
npm run review:wake -- --once
```

Procura decisões autorizadoras na fila de revisão e cria um wake pointer durável.

Ele **não executa** a continuação; apenas registra que ela pode ser retomada.

### Manter observador ativo

```bash
npm run review:wake
```

### Sincronizar fila de revisão

```bash
npm run review:sync
```

Por padrão executa um ciclo. O comportamento pode ser configurado por variáveis de ambiente.

---

## 10. ChatGPT Work Execution Endpoint

Esta é uma ponte experimental já implementada entre o ARCA e uma superfície event-driven do ChatGPT Work.

### Heartbeat

```bash
npm run work:endpoint -- heartbeat
```

Valida a configuração do endpoint.

### Acordar o Work para uma tarefa

```bash
npm run work:endpoint -- wake --job ./job.json
```

Cria o estímulo de wake correlacionado com uma tarefa Machine Bridge já existente.

### Consultar ACK

```bash
npm run work:endpoint -- ack --wake-id HASH_DO_WAKE
```

Pode incluir o commit:

```bash
npm run work:endpoint -- ack \
  --wake-id HASH_DO_WAKE \
  --commit-sha SHA_DO_COMMIT
```

### Consultar resultado

```bash
npm run work:endpoint -- result \
  --job-id ID_DA_TAREFA \
  --request-id ID_DA_REQUISICAO
```

Variáveis normalmente necessárias:

```bash
export ARCA_GITHUB_TOKEN='...'
export ARCA_GITHUB_REPOSITORY='uknwplayer/ARCA'
export ARCA_WORK_WAKE_REF='branch-isolada'
export ARCA_WORK_WAKE_PR='NUMERO_DA_PR'
```

**Importante:** `wake` não significa execução, autoridade ou permissão de alterar código.

---

## 11. Aquisição e cadeia de custódia

Ajuda básica:

```bash
npm run acquire
```

Comandos suportados pelo binário:

```text
capture
verify
transform
review
enqueue
from-json
```

### Verificar uma captura

```bash
npm run acquire -- verify \
  --home .arca \
  --investigation INV-000001 \
  --acquisition ACQ-000001
```

### Capturar arquivo local

A captura exige declaração explícita de origem, acesso, ator e localização. Consulte o contrato antes de usar em dados reais.

---

## 12. Testes e saúde do repositório

### Testes gerais

```bash
npm test
```

### Verificações gerais

```bash
npm run check
```

### Verificação da fronteira pública

```bash
npm run check:public
```

### Testes PNCP

```bash
npm run test:pncp
```

### Testes do Core

```bash
npm run test:core
```

### Testes de agentes

```bash
npm run test:agent
```

### Testes do Workbench

```bash
npm run test:workbench
```

---

## 13. Comandos investigativos M5

Esses comandos são principalmente validadores de desenvolvimento e gates; não devem ser usados como atalhos para ignorar políticas de rede/custódia.

Exemplos:

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

Esses comandos validam contratos, parsers, gates e invariantes. Um validador verde não equivale a autorização para qualquer operação externa fora das regras do ARCA.

---

## 14. Git e atualização do projeto

### Ver estado local

```bash
git status
```

### Atualizar referências remotas

```bash
git fetch
```

### Atualizar a branch atual com segurança quando ela acompanha a remota

```bash
git pull --ff-only
```

### Ver autenticação GitHub

```bash
gh auth status
```

### Ver PRs

```bash
gh pr list
```

### Ver Actions recentes

```bash
gh run list --limit 10
```

---

## 15. Conversação ARCA ↔ GPT pelo Termux

### Estado atual

Ainda **não existe** no ARCA um comando oficial:

```bash
arca chat
```

nem:

```bash
npm run arca:chat
```

Não trate esses comandos como implementados.

Hoje existem peças reutilizáveis:

- Creator Chat Gateway;
- adapters de raciocínio;
- Machine Bridge;
- Vince/Termux;
- Execution Endpoint;
- checkpoint e roadmap;
- controles de capability;
- políticas de segurança;
- futura abstração AI Gateway.

### Objetivo da nova frente

A interface desejada é:

```text
Termux
   ↓
ARCA CLI
   ↓
ARCA Chat Gateway
   ↓
provedor de raciocínio
   ↓
GPT
   ↓
ARCA
   ↓
Termux
```

Uso pretendido:

```text
~/ARCA $ arca chat
ARCA > onde paramos?
GPT  > ...
ARCA > prossiga
GPT  > ...
```

E modo de pergunta única:

```bash
arca ask "qual o estado atual do M5?"
```

Esses comandos são **alvo de desenvolvimento**, não comandos disponíveis hoje.

### Requisitos mínimos da implementação

A ponte Termux ↔ GPT deverá:

1. usar um provedor explícito, inicialmente compatível com OpenAI API;
2. nunca armazenar API key no repositório;
3. manter orçamento por chamada/sessão/período;
4. registrar modelo/provedor/custo e hashes de entrada/saída quando aplicável;
5. poder anexar checkpoint, estado do ARCA e capabilities autorizadas;
6. separar conversa de autorização de ferramentas;
7. impedir que uma resposta do modelo conceda autoridade a si própria;
8. manter kill switch;
9. permitir modo one-shot e sessão interativa;
10. futuramente aceitar outros provedores ou modelo local sem mudar a interface do usuário.

### Fronteira com ChatGPT Work

A futura conversa GPT pelo Termux e o Work são funções diferentes:

```text
arca chat  → conversa/raciocínio interativo
Work       → executor externo para tarefas maiores
Vince      → descoberta/roteamento/worker
Machine Bridge → transporte de tarefas/resultados
```

Uma conversa poderá futuramente solicitar uma tarefa ao Work através do ARCA, mas isso deverá continuar sujeito aos gates de autoridade existentes.

---

## 16. Comandos que vale decorar

Para uso diário no celular:

```bash
cd ~/ARCA
node scripts/arca-vince-v41-termux.mjs doctor
git status
git pull --ff-only
npm run arca -- list
npm run workbench
npm test
npm run check:public
gh pr list
gh run list --limit 10
```

Para Machine Bridge:

```bash
npm run remote:submit -- --help
npm run remote:call -- --help
```

Para Vince:

```bash
node scripts/arca-vince-v41-termux.mjs --help
```

---

## 17. Regra de segurança operacional

Nunca cole ou publique:

- `ARCA_GITHUB_TOKEN`;
- `GITHUB_TOKEN`;
- API keys de provedores de IA;
- passphrases de custódia;
- chaves privadas Ed25519;
- secrets do Portal da Transparência;
- conteúdo privado de envelopes de custódia.

Chaves e tokens pertencem ao ambiente local ou ao secret store apropriado, nunca ao Git público.
