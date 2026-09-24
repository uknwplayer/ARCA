# ARCA 0.4.0-rc.1 — rede investigativa autônoma auditável

O ARCA estrutura investigações como grafos auditáveis e opera uma rede de agentes com autoridade limitada, fila compartilhada, custódia verificável e revisão humana. O escopo PNCP é nacional: todas as 27 unidades federativas são tratadas como partições equivalentes. o município do primeiro teste permanece apenas como origem histórica do primeiro teste, nunca como limite territorial ou padrão operacional.

> **Estado real:** release candidate de engenharia e piloto controlado. A base atual passou em 853 testes Node e 27 testes Python da malha executora. Há provas controladas de aquisição PNCP ao vivo, custódia criptografada e persistência durável privada. Ainda não há prova ponta a ponta de produção, serviço 24/7, métricas de qualidade do classificador em tráfego real nem publicação autônoma. Toda publicação exige revisão humana.

Documentos de entrada:

- [Documento Mestre v1.4.0](docs/ARCA_DOCUMENTO_MESTRE_v1.4.0_PUBLICO.md)
- [Matriz de estado 0.4.0-rc.1](docs/ARCA_STATUS_MATRIX_0_4_0_RC1.md)
- [Checkpoint atual para retomada](docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md)
- [Roadmap detalhado atual](docs/ARCA_ROADMAP_DETALHADO_CURRENT.md)
- [Política de checkpoint](docs/ARCA_CHECKPOINT_HANDOFF_POLICY_V0_1.md)
- [Política oficial de idioma pt-BR](docs/ARCA_POLITICA_IDIOMA_PT_BR.md)
- [Atlas Técnico Vivo](docs/ARCA_ATLAS_TECNICO_VIVO_V0_1.md)
- [Inventário machine-readable do Atlas](docs/atlas/ARCA_ATLAS_COMPONENTES_V0_1.json)
- [Guia geral de comandos do ARCA no Termux](docs/ARCA_TERMUX_COMMANDS_V0_1.md)
- [Ponte Termux ↔ GPT V0.1](docs/ARCA_TERMUX_GPT_BRIDGE_V0_1.md)

## Idioma oficial

O ARCA é um projeto brasileiro. **Português brasileiro (pt-BR) é o padrão obrigatório para documentação e demais conteúdos humanos novos ou significativamente alterados.** Termos externos, campos de API/protocolo, identificadores e mensagens exatas podem permanecer no original quando necessário à compatibilidade, sempre com explicação em português.

## Modelo operacional

- a rede acorda por eventos e trabalho acionável; não por quantidade de pessoas conectadas;
- uma investigação canônica é compartilhada, evitando dez agentes duplicados para dez usuários;
- observadores nacionais consultam fontes públicas e enfileiram candidatos com deduplicação;
- agentes propõem, confrontam e verificam; não publicam como verdade;
- humanos auditam, comentam, adicionam fontes, contestam, confirmam e decidem publicação;
- indisponibilidade transitória de fonte gera lacuna explícita e retentativa controlada, nunca suspeita automática;
- dados sensíveis, credenciais e material bruto não pertencem ao repositório público.

## Componentes

| Camada | Papel | Estado |
|---|---|---|
| Core + event store | Grafo, eventos, TRACE, invalidação, validação e exportação | implementado e testado |
| Workbench/Creator | Interface local, revisão e controle | implementado; não é portal comunitário de produção |
| Agent/AIE | propostas, avaliação, guardrails e composição de capacidades | implementado e testado em cenários controlados |
| Fila investigativa | trabalho compartilhado, deduplicação e backend durável | implementado |
| Malha executora | despacho limitado e reconciliação entre executores | prova ao vivo controlada |
| Observador PNCP | agenda nacional, 27 UFs, aquisição limitada e disponibilidade de fonte | implementado; provas ao vivo de um shard |
| Gate multifonte | contrato de fonte, envelopes com hash, deduplicação, dois agentes e revisão | V1 offline; PNCP e Portal da Transparência executam fixtures separadas |
| Custódia | envelope AES-256-GCM/scrypt e backend privado endereçado por conteúdo | prova durável controlada |
| Publicação | fronteira sanitizada e revisão humana | portão implementado; publicação autônoma proibida |

## Provas controladas principais

- ciclo offline nas 27 UFs, sem rede: PR [#61](https://github.com/uknwplayer/ARCA/pull/61);
- aquisição PNCP controlada 001: [prova](docs/ARCA_PNCP_CONTROLLED_LIVE_PROOF_001.md), execução [35544888070](https://github.com/uknwplayer/ARCA/actions/runs/35544888070);
- migração criptografada para custódia durável: [prova](docs/ARCA_DURABLE_CUSTODY_MIGRATION_PROOF_001.md), execução [35546194827](https://github.com/uknwplayer/ARCA/actions/runs/35546194827);
- aquisição PNCP com persistência durável 002: [prova](docs/ARCA_PNCP_DURABLE_LIVE_PROOF_002.md), execução [35547609136](https://github.com/uknwplayer/ARCA/actions/runs/35547609136);
- malha investigativa Mesh006: execução [35539487516](https://github.com/uknwplayer/ARCA/actions/runs/35539487516).

As provas ao vivo mantiveram classificador e ingresso investigativo desligados. Elas demonstram aquisição/custódia limitada, não uma investigação completa nem qualidade de detecção.

## Instalação e verificação

Requer Node.js 22.18 ou superior e Python 3.12 para os testes da malha.

```bash
npm ci
npm test
PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v
PYTHONPATH=. python scripts/validate-investigative-roadmap.py
npm run validate:multisource
npm run check:public
```

Para o Workbench local:

```bash
npm run workbench
```

Abra `http://127.0.0.1:4317`. O servidor recusa bind não local por padrão. O modo remoto não inclui uma implantação multiusuário pronta para produção.


## Operação pelo Termux

O Android + Termux é um ambiente operacional suportado para o desenvolvimento atual do ARCA. O guia canônico de comandos está em [ARCA_TERMUX_COMMANDS_V0_1.md](docs/ARCA_TERMUX_COMMANDS_V0_1.md).

Atalhos úteis:

```bash
cd ~/ARCA
node scripts/arca-vince-v41-termux.mjs doctor
npm run arca -- help
npm run arca -- list
npm run workbench
npm run remote:call -- --help
npm test
npm run check:public
gh pr list
gh run list --limit 10
```

O worker Vince V4.1 para Termux é atualmente **one-shot**: ele executa `once --job-id ...` e encerra; esse script não possui daemon permanente.

### Foco temporário de desenvolvimento — conversa ARCA ↔ GPT

O trilho investigativo M5 permanece preservado, mas seu avanço está temporariamente pausado. O PR #212 deve permanecer aberto sem merge enquanto esta frente estiver ativa.

A prioridade imediata passa a ser uma interface de conversação pelo Termux:

```text
Termux → ARCA CLI/Chat Gateway → provedor de raciocínio → GPT → ARCA → Termux
```

A **Fase A** adiciona `arca ask` para uma pergunta única via OpenAI Responses API, passando pelo `ReasoningProviderRegistry` e pelo Reasoning Transport Gate. O envio exige `--allow-external`, a chave fica em `OPENAI_API_KEY`, `store:false` é usado e nenhuma ferramenta/Core mutation é autorizada. O futuro `arca chat` interativo permanece como Fase B.

O ChatGPT Work permanece uma função separada: pode atuar como executor externo de tarefas maiores, enquanto a nova interface Termux ↔ GPT será voltada à conversa/raciocínio interativo.


## Princípios invariantes

- investigação é grafo, não narrativa;
- documento não é verdade;
- anomalia não é irregularidade;
- evidência só exerce efeito por relação explícita;
- agentes propõem; pessoas revisam; o Core valida e registra;
- nenhuma falha de transporte é convertida automaticamente em acusação;
- a publicação pública deve ser sanitizada, proporcional e revisada.

## Limites do RC1

O ARCA ainda precisa provar, em portão explícito e limitado, o fluxo PNCP ao vivo → classificação → fila investigativa → múltiplos agentes → verificação adversarial → revisão humana. Também faltam operação contínua, observabilidade e alertas de produção, rotação formal de segredos, armazenamento WORM/object-lock e interface comunitária madura.

Não use este RC para alegar certificação, conclusão jurídica, irregularidade, cobertura nacional contínua ou prontidão de produção.
