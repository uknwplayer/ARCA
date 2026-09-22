# ARCA — Checkpoint 014: M4b Portal verificado em CI

Data: **2026-09-22**

Estado: **IMPLEMENTAÇÃO M4b CONCLUÍDA; CI CANÔNICA NODE 22.18 VERDE; MERGE E GET REAL AINDA NÃO EXECUTADOS**

Branch: `docs/m4b-portal-contract-spec`

PR: **#88 — M4b: captura Portal limitada com custódia privada (offline)**

Head verificado: `8fff8e7f9b8ec46ee5eef7a959006e78d57644ab`

CI canônica: **run 35795775111 — success**, job `Node 22.18 — full test suite and repository check` concluído com sucesso.

## O que este checkpoint fecha

- contrato oficial do endpoint Portal registrado;
- escopo v0.2 limitado e hash-only;
- transporte de uma chamada com host/rota/query fixos, redirect recusado, timeout, zero retry e teto de 64 KiB;
- captura dos bytes originais antes de interpretação;
- cifragem e persistência privada durável antes de sucesso;
- reabertura/verificação da custódia;
- prova sanitizada;
- workflow exclusivamente manual;
- testes sintéticos/fake fetch;
- CI Node 22.18 verde.

Os resultados locais anteriores permanecem válidos como evidência complementar: 34/34 testes focados, 27/27 Executor Mesh Python, validadores M0–M3 e `check:public` verdes. A discrepância `UND_ERR_SOCKET` observada apenas no Node 24 local não ocorreu no gate canônico Node 22.18.

## O que continua explicitamente não autorizado

- nenhum GET real do Portal foi executado;
- nenhum código de documento real foi incorporado ao repositório;
- nenhum token/API key foi publicado;
- nenhum classificador, correlação live, ingresso investigativo ou publicação foi ativado;
- este checkpoint não autoriza dispatch do workflow;
- merge da PR #88 continua sendo decisão canônica separada.

## Próximo gate

1. Revisão final da PR #88 contra este checkpoint e o desenho M4.
2. Integração em `main` somente após autorização canônica.
3. Verificar CI pós-merge.
4. Só então preparar manifesto concreto de **um** documento e pedir autorização explícita separada para **um** GET real.
5. No primeiro acesso live, capturar e custodiar; não correlacionar nem classificar.

## Independência de Work

Este caminho não depende do ChatGPT Work. O Work pode permanecer indisponível por cota sem bloquear M4b, merge, CI GitHub Actions ou o futuro probe Portal manual.
