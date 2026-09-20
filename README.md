# ARCA 0.3.0 — Core + Workbench + Agent Bundle + Acquisition & Custody

O ARCA é um sistema local para estruturar investigações como grafos auditáveis. A versão `0.3.0` preserva o Core, Workbench e Agent Bundle 0.2.0 e acrescenta aquisição local com bytes originais, SHA-256 real e cadeia de custódia separada.

> **Estado:** release funcional local verificado: `npm test` concluiu 42/42 e `npm run check` foi aprovado em Node.js 24.19.0. Não declarado `ARCA-Compatible`, sem selo oficial e sem autenticação para exposição em rede. O validador mantém requisitos humanos ou independentes como `UNSPECIFIED`.

Documentação consolidada: [Documento Mestre v1.3.0 — edição pública higienizada](examples/acquisition-pilot/arca-home/acquisitions/INV-ARCA-RELEASE-VALIDATION/ACQ-PILOT-MASTER-1-3-PUBLIC/original/ARCA_DOCUMENTO_MESTRE_v1.3.0_PUBLICO.pdf).

## Princípios invariantes

- O Crivo não procura uma conclusão. Procura evidências.
- Investigação é grafo, não narrativa.
- Sem inferência automática.
- Documento não é verdade.
- Evidência só exerce efeito por relação explícita `INF → PRO`.
- O Core funciona offline e não depende de IA, OCR, rede ou conta externa.
- Agentes propõem; pessoas revisam; o Core valida e registra.

## Aquisição e cadeia de custódia 0.3.0

- captura somente arquivo regular em raiz autorizada;
- preserva bytes originais e calcula SHA-256 local;
- registra localizador, instante e declaração de acesso;
- mantém transformações e revisões em `custody.ndjson` encadeado;
- verifica original, derivados, cadeia e projeção;
- enfileira intenção sem executar rede nem contornar acessos;
- produz proposta de `DOC`, nunca evento canônico direto.

Use `npm run acquire -- --help` ou leia `packages/acquisition/README.md`.

## O que está funcional

| Camada | Função | Autoridade |
|---|---|---|
| ARCA Core | Objetos tipados, relações, eventos, TRACE, invalidação, reavaliação, O Limite, ACS e exportação | Única camada que valida e grava o estado canônico |
| ARCA Workbench | Interface local, formulários, grafo, inventário, TRACE, conformidade, histórico e revisão de propostas | Cliente do Core; não possui regra epistêmica paralela |
| Agent Bundle | Prompt portátil, schema, armazenamento, integridade e ciclo de revisão | Somente proposta; nunca escreve diretamente no log |
| CLI | Operações offline e automação local | Cliente direto do Core |

## Requisitos

- Node.js `22.18` ou superior, pois esta é a primeira versão 22 que executa
  diretamente os entrypoints TypeScript usados pelo ARCA sem flag adicional;
- nenhum pacote externo de runtime;
- macOS, Linux ou ambiente equivalente com Node compatível.

## Executar o Workbench

```bash
npm install
npm run workbench
```

Abra `http://127.0.0.1:4317`. O armazenamento padrão fica em `.arca-workbench`.

Para usar outro diretório ou porta:

```bash
npm run workbench -- --home /caminho/seguro/arca --port 4400
```

O servidor recusa bind não local por padrão. O modo `--allow-remote` não contém autenticação e só deve ser usado atrás de uma camada de acesso confiável; ele não é uma configuração de produção.

## Criar uma demonstração visual

Em um primeiro terminal:

```bash
npm run arca -- demo --home .arca-workbench
```

Em seguida:

```bash
npm run workbench
```

A demonstração usa somente conteúdo sintético e declara `simulation: true`.

## Fluxo de uso sem JSON

1. crie a investigação pela questão, objetivo, escopo e limites;
2. registre `SRC`, `DOC`, `INF`, `PRO`, `HIP`, `GAP`, `CON` e os demais tipos por formulários;
3. ligue os objetos com relações explícitas;
4. use TRACE para verificar todas as trilhas reais;
5. invalide suportes e reavalie dependentes quando necessário;
6. acompanhe os 47 requisitos ACS;
7. feche conclusões somente após o Crivo e O Limite;
8. exporte o pacote `.arca.json` com estado, eventos, validação e hashes.

JSON aparece somente na CLI e no intercâmbio avançado de propostas de agente.

## Integração de agentes

O Workbench oferece dois arquivos portáteis:

- `packages/agent/ARCA_AGENT_SYSTEM_PROMPT_v0.2.0.md`;
- `packages/agent/arca-agent-proposal-v1.schema.json`.

Um agente deve produzir exatamente uma operação no formato `arca-agent-proposal-v1`. O Workbench acrescenta ID, horário e SHA-256, verifica o `eventHead`, apresenta premissas e incertezas e exige a confirmação textual `APLICAR <proposalId>`. Se o grafo mudou, a proposta fica obsoleta e falha fechada.

O evento aplicado registra o revisor humano, o ID e o hash da proposta. O modelo nunca recebe permissão para adquirir, assinar, publicar, conceder selo ou alterar o event log.

## CLI

```bash
# Criar investigação
npm run arca -- investigation create \
  --home .arca \
  --question "Qual afirmação deve ser verificada?" \
  --objective "Verificar com material rastreável" \
  --scope "Fontes legitimamente acessíveis" \
  --limits "Sem conteúdo privado"

# TRACE
npm run arca -- trace --home .arca \
  --investigation INV-000001 --target CON-000001

# Validar e exportar
npm run arca -- validate --home .arca --investigation INV-000001
npm run arca -- export --home .arca \
  --investigation INV-000001 --out INV-000001.arca.json
```

Use `--json` para saída de automação. Os comandos completos estão em `npm run arca -- help`.

## Compatibilidade legada sem dados distribuídos

O migrador conservador continua disponível na API do Core: calcula SHA-256,
converte a questão em `Q`, normaliza aliases versionados e preserva dados
desconhecidos como desconhecidos. A distribuição pública não inclui estados,
exportações ou relatórios de investigações. A compatibilidade é exercitada por
fixtures inteiramente sintéticas, construídas apenas na memória durante os
testes.

## Segurança operacional

- diretórios privados `0700` e arquivos `0600`, quando suportados;
- IDs validados antes de formar caminhos e rejeição de symlinks inseguros;
- log NDJSON append-only com lock, sequência e cadeia SHA-256;
- escrita atômica de exportações e propostas;
- concorrência otimista conferida dentro do lock pelo `expectedEventHead`;
- servidor em loopback por padrão, CSP, bloqueio de frames, política de origem, CSRF e corpo máximo de 1 MiB;
- proposta com hashes de conteúdo e registro, uma operação e revisão humana obrigatória;
- adulteração do log ou da proposta interrompe a operação.

## Verificação

```bash
npm test
npm run check
```

A suíte `0.3.0` preserva os 30 testes anteriores e declara 12 testes novos de aquisição, totalizando 42.

A rodada integral realizada em 14 de setembro de 2026 aprovou os 42 testes sem
falhas. O workflow `.github/workflows/arca-ci.yml` repete o portão em Node.js
22.18.0. A árvore `examples/acquisition-pilot/` preserva a primeira captura real
autorizada e sua revisão humana append-only.

## Estrutura

```text
docs/                 especificações, ADRs e relatórios de entrega
schemas/              contratos JSON canônicos
packages/core/        Core determinístico e event store
packages/cli/         interface offline
packages/workbench/   servidor local, API e interface visual
packages/agent/       protocolo e ciclo de propostas
packages/acquisition/ aquisição local e custódia verificável
examples/             fixtures técnicas e captura-piloto pública higienizada
tests/                testes unitários, integração, propriedades e segurança
```

## Limites do marco 0.3.0

- não há autenticação, autorização multiusuário ou criptografia do volume;
- não há OCR, busca, aquisição, sincronização ou publicação embutidos;
- não há edição ou exclusão destrutiva do event log;
- não há assinatura digital nem Registry/Resolver/Attestation/Federation integrados;
- não há alegação de prontidão regulatória ou produção.

Leia [ARCA Workbench Specification v0.2.0](docs/ARCA_WORKBENCH_SPEC_v0.2.0.md), [ARCA Agent Protocol v0.2.0](docs/ARCA_AGENT_PROTOCOL_v0.2.0.md) e [ARCA Core Specification v1.0.0](docs/ARCA_CORE_SPEC_v1.0.0.md) antes de estender o sistema.
