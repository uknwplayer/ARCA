# ARCA — Matriz de estado 0.4.0-rc.1

Data de corte: 2026-09-23. Referência Vince: Probe 011 selected one-shot live-proven.

Legenda: **sim**, **parcial**, **não**. “Ao vivo” significa prova limitada e registrada; não significa produção.

| Componente | Implementado | Testado | Prova ao vivo | Produção | Evidência | Falta principal |
|---|---:|---:|---:|---:|---|---|
| Atlas Técnico Vivo | sim, V0.1 | documental | n/a | não | `docs/ARCA_ATLAS_TECNICO_VIVO_V0_1.md` + inventário JSON | manter atualizado em toda mudança arquitetural significativa |
| Política de idioma pt-BR | sim | documental | n/a | n/a | `docs/ARCA_POLITICA_IDIOMA_PT_BR.md` | migrar históricos em inglês gradualmente |
| Vince Discovery Global | planejado | não | não | não | `docs/ARCA_VINCE_DISCOVERY_GLOBAL_V0_1.md` | implementar depois sem competir com M5; discovery mundial incluindo China |
| Core e event store | sim | sim | n/a | parcial | suíte integral; TRACE e cadeia SHA-256 | auditoria independente |
| Workbench/Creator | sim | sim | parcial | não | testes de interface e controle | autenticação/UX comunitária/implantação |
| Protocolo de agentes e AIE | sim | sim | parcial | não | testes de capacidades, guardrails e runtime | avaliação prolongada e SLOs |
| Fila investigativa compartilhada | sim | sim | não | não | PRs #56–#57 | operação contínua e telemetria |
| Malha executora | sim | sim | sim | não | run 35539487516, 4/4 filhos | resiliência prolongada e governança |
| Vince Pathfinder/Recovery V0.4 + V4.1.1 + V5 | sim | sim | sim para V1–V4.1.1, Work read-only, A/B routing e selected one-shot | não | Probe 011: B único elegível → dispatch pinado → 1 git-status → Ed25519 → CAS durável → replay rejeitado sem reexecução; PR #151 | provar redundância física multi-dispositivo; manter capability restrita; signer V3.2-live |
| Observador PNCP nacional | sim | sim | parcial | não | PRs #58–#60; 27 UFs offline | agenda 24/7 e métricas reais |
| Gate Offline Multifonte V1 + M3 correlacionado | sim, fixtures sintéticas | sim | não | não | PR #81; CI 35695672043; 11 envelopes, 8 vínculos, AC/AL/AM, 2 agentes | M4: aquisição live limitada e custódia validada |
| Transferegov Transferências Especiais S1 | sim, fixture sintética | sim, PR #179 | não | não | novo ambiente oficial de APIs + adaptador offline + Evidence Envelopes hash-only | aceitar CI/merge; depois desenhar gate live separado |
| TCU Acórdãos S2 | sim, fixture sintética nacional | sim, branch/PR S2 | não | não | snapshot S2 + `BR/NATIONAL` + adaptador/validador offline | CI/merge; depois Siconfi S3 |
| Correlação PNCP ↔ execução financeira M2/M5-A/M5-B/M5-C/M5-D/M5-E | sim, M2 sintético + M5 pré-correlação + pós-custódia + observação de schema | sim | não | não | PR #79/#94/#155/#162; M5-C CI 35855501213 e pós-merge 35855589032 | primeiro 2xx Portal custodial, observação live, parser revisado e duas entradas live normalizadas |
| M5-C Observador estrutural do schema Portal | sim | sim | não | não | PR #162; CI #339/#340; estrutura sem valores vinculada à custódia | primeiro 2xx real para gerar observação live e posterior parser revisado |
| M5-E Binding do preflight ao probe live | sim | sim | sim para binding do quarto probe: preflight passou antes do transporte | não | PR #173; Gate 040 run 35885734963; live run 35886041113 | binding provado; falta primeiro 2xx Portal |
| Gate 040 Preflight Portal isolado | sim | sim | sim: preflight operacional com secrets reais, 0 GET Portal | não | PR #168; CI #348/#349; run 35884318441 success; `READY_FOR_EXPLICIT_AUTHORIZATION`; cofre privado pronto | manter hashes vinculados; qualquer drift exige novo preflight e nova revisão |
| M5-D Prontidão da credencial Portal | sim | sim | parcial: 401 observado em probe autorizado | não | PR #165; run 35886041113; fingerprint canônico `37c90b...a8092`; `AUTHORIZATION_NOT_ESTABLISHED` | diagnosticar 401; somente 2xx pode comprovar atividade |
| Portal da Transparência / captura M4b | sim, fixture + transporte + preview + custódia HTTP V0.3 + M5-D + Gate 040 + M5-E | sim | parcial: 4 GETs 401; quarto capturado/selado/custodiado; nenhum 2xx | não | run 35886041113; 1 request; retries=0; `STORED_PRIVATE` | Gate 042: diagnóstico offline/suporte; nenhum quinto GET autorizado |
| Aquisição PNCP controlada | sim | sim | sim | não | runs 35544888070 e 35547609136 | expansão gradual e orçamento operacional |
| Disponibilidade da fonte | sim | sim | parcial | não | PR #71 | política de retentativa/alerta em serviço |
| Classificador de sinais | parcial | sim, sintético | não | não | fixtures e testes | precisão/recall e calibração em dados reais |
| Ingresso investigativo automático | sim, fechado por gate | sim | não | não | guardrails dos probes | primeiro piloto ponta a ponta |
| Verificação adversarial | sim | sim | parcial | não | piloto controlado e malha | prova vinculada ao PNCP ao vivo |
| Custódia criptografada | sim | sim | sim | parcial | AES-256-GCM/scrypt; provas 001/002; M4b Portal integrado | primeiro recibo Portal real; rotação e gestão operacional |
| Backend durável privado | sim | sim | sim | parcial | run 35547609136 | WORM/object-lock e retenção formal |
| Fronteira de publicação | sim | sim | parcial | não | `publication:check` | fluxo comunitário e governança |
| Publicação autônoma | proibida | sim | não | não | revisão humana obrigatória | decisão futura, não pressuposta |
| Cobertura nacional contínua | arquitetura sim | offline sim | não | não | atestado de 27 UFs | serviço sempre ativo e observabilidade |

## Verificação de corte

A execução pós-M3 [35695672043](https://github.com/uknwplayer/ARCA/actions/runs/35695672043) aprovou:

- 886 testes Node;
- 27 testes Python da malha executora;
- piloto investigativo controlado;
- Gate Offline Multifonte V1;
- Gate de correlação financeira M2 e Gate correlacionado M3;
- verificação do repositório e fronteira pública.

O validador M2 registrou um caso de cada estado (`CONFIRMED`, `CANDIDATE`, `CONFLICTING`, `NOT_OBSERVED`), rede desligada e nenhuma publicação.

## Leitura correta

O ARCA é um protótipo avançado com pilotos controlados e invariantes de segurança exercitados. Ainda não é um serviço autônomo nacional em produção. “Nacional” descreve a arquitetura e o particionamento por 27 UFs; não declara disponibilidade permanente nem que todos os municípios foram consultados ao vivo.
