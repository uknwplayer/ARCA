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
| Transferegov Transferências Especiais S1 | sim, fixture sintética | sim, integrado PR #179 | não | não | snapshot S1 + adaptador offline + Evidence Envelopes hash-only; CI pós-merge 35895334779 | gate live separado somente se necessário |
| TCU Acórdãos S2 | sim, fixture sintética nacional | sim, integrado PR #180 | não | não | snapshot S2 + `BR/NATIONAL` + adaptador/validador; CI 35895838624 e pós-merge 35909777789 | Siconfi S3 |
| Correlação PNCP ↔ execução financeira M2/M5-A/M5-B/M5-C/M5-D/M5-E | sim, M2 sintético + M5 pré-correlação + pós-custódia + observação de schema | sim | parcial: autenticação Portal 2xx comprovada, sem dado financeiro live | não | PR #79/#94/#155/#162; auth validation run 35910916588 | primeiro 2xx de `documentos-relacionados`, observação do schema financeiro, parser revisado e entradas live normalizadas |
| M5-C Observador estrutural do schema Portal | sim | sim | parcial: 2xx apenas no endpoint de autenticação, sem schema financeiro | não | PR #162; Gate 045 prova autenticação live | primeiro 2xx de `documentos-relacionados` para observação estrutural financeira e posterior parser revisado |
| M5-E Binding do preflight ao probe live | sim | sim | sim: binding histórico e Gate 040-SI target-bound com 2xx | não | PR #173; Gate 040-SI 35910828041; live 35910916588 | reutilizar padrão target-bound em futuro request financeiro autorizado |
| Gate 040 Preflight Portal isolado | sim | sim | sim: preflight operacional com secrets reais, inclusive variante target-bound SI, 0 GET no gate | não | Gate histórico + Gate 040-SI run 35910828041; `READY_FOR_EXPLICIT_AUTHORIZATION`; cofre privado pronto | cada novo alvo/revisão exige novo preflight e nova autorização |
| M5-D Prontidão da credencial Portal | sim | sim | sim: HTTP 200 observado no endpoint recomendado pela CGU | não | run 35910916588; fingerprint `37c90b...a8092`; `ACCEPTED_ON_OBSERVED_REQUEST`; `activeVerified=true` | atividade da chave comprovada; falta provar endpoint financeiro específico |
| Portal da Transparência / captura M4b | sim, fixture + transporte + preview + custódia HTTP V0.3 + M5-D + Gate 040 + M5-E + auth validation SI | sim | parcial: 4 históricos 401 em `documentos-relacionados`; auth validation separada retornou HTTP 200 | não | run 35910916588; exatamente 1 GET; retries=0; `STORED_PRIVATE`; `activeVerified=true` | `documentos-relacionados` permanece intermitente e não foi retestado após ativação; nenhum novo GET autorizado |
| Aquisição PNCP controlada | sim | sim | sim | não | runs 35544888070 e 35547609136 | expansão gradual e orçamento operacional |
| Disponibilidade da fonte | sim | sim | parcial | não | PR #71 | política de retentativa/alerta em serviço |
| Classificador de sinais | parcial | sim, sintético | não | não | fixtures e testes | precisão/recall e calibração em dados reais |
| Ingresso investigativo automático | sim, fechado por gate | sim | não | não | guardrails dos probes | primeiro piloto ponta a ponta |
| Verificação adversarial | sim | sim | parcial | não | piloto controlado e malha | prova vinculada ao PNCP ao vivo |
| Custódia criptografada | sim | sim | sim | parcial | AES-256-GCM/scrypt; Portal auth run 35910916588 com `STORED_PRIVATE`, receipt `5168cb...9854` | rotação e gestão operacional; WORM futuro |
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
