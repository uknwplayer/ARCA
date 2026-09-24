# ARCA — Matriz de estado 0.4.0-rc.1

Data de corte: 2026-09-24. Referência Vince: Probe 011 selected one-shot live-proven.

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
| Correlação PNCP ↔ execução financeira M2/M5-A…M5-L | sim, contratos/gates + duas fontes live normalizadas + triagem privada | sim | parcial: M5-L executado, 2 pares e 0 candidatos | não | run 36028937585; `NO_CANDIDATE_BRIDGE_OBSERVED`; `confirmedCount=0` | ampliar cobertura documental antes de qualquer correlação forte |
| M5-C Observador estrutural do schema Portal | sim | sim | sim: schema financeiro observado no run 35917902630 | não | `SCHEMA_OBSERVED`; `observedSchemaSha256=79f6c837...666f6`; parser V1 implementado depois | admissão da normalização live continua separada |
| M5-F Parser Portal do schema Gate 046 | sim, fixture sintética | sim, parser fail-closed | não aplica bytes live | não | 11 campos exatos; parser contract hash; `liveNormalizationAuthorized=false` | M5-G implementado; falta decisão canônica e aplicação custodial |
| M5-G Admissão da normalização custodial | sim, gate candidato | sim | candidato canônico admitido e consumido | não | `candidateSha256=0bcf1806...e97f9`; `decisionSha256=343392fa...ae420` | concluído; decisão usada no M5-H |
| M5-H Normalização custodial offline | sim, executor + transporte privado controlado | sim | sim: run 35931108034 | não | 1 registro normalizado; `normalizationSha256=f7306be0...bcfa7`; novo envelope privado `6cb8513d...cbcb` | M5-I binding para Fase B; correlação segue bloqueada |
| M5-I Binding live normalizado Portal | sim, binding sanitizado | sim | sim: fonte live normalizada pronta | não | captura original + derivação normalizada preservadas; `correlationAuthorized=false` | integrar e abrir gate separado de correlação |
| M5-J Binding PNCP live normalizado | sim, captura + parser + normalização + binding | sim | sim: 2 registros normalizados e persistidos | não | run 36026221085; `normalizationSha256=c91e5bce...b7a2d`; receipt privado `00d024c3...b9447`; `supplierObserved=false` | gate de prontidão de correlação; fornecedor não pode ser inferido |
| M5-K Prontidão de correlação | sim, gate estrutural | sim | não abre valores privados | não | `readyForStrongCorrelation=false`; `readyForPrivateCandidateScreening=true`; fornecedor indisponível por cobertura | M5-L triagem privada de candidatos, mantendo estado no máximo `CANDIDATE` |
| M5-L Triagem privada de candidatos | sim, integrado | sim | sim: run 36028937585 | não | 2 pares, 0 candidatos, 0 confirmados; `screeningSha256=06440986...81e95`; nenhum sinal fraco/candidato coincidiu | ampliar cobertura documental; não executar correlação forte com estas capturas |
| M5-M Cobertura PNCP contratos/empenhos | sim, query runtime hash-bound | sim | run 36039677768: 2 GETs com `pagina=1`, 404/404, zero retries; diagnóstico 36040450553 `UNCLASSIFIED` | não | envelope `568f3eb1...14eb`; sem marcador seguro de rota/parâmetro/acesso; ausência contratual não comprovada | não repetir; desenhar gate item→resultado sob novo candidato/autorização |
| M5-N1 Descoberta PNCP de itens | sim, hash-bound + cost policy + custody-before-observation | sim | live 36051395397 + offline 36052511200 | não | 9 itens válidos; 0 com `temResultado=true`; cobertura completa; `observationSha256=e4f19858...5a88` | M5-N2 não aplicável; buscar outra ponte pública ou ampliar amostra |
| M5-E Binding do preflight ao probe live | sim | sim | sim: binding usado com sucesso também no Gate 046 financeiro | não | Gate 046 preflight 35916999807 + live 35917902630 | manter padrão em futuros requests; nenhum novo request necessário para parser |
| Gate 040 Preflight Portal isolado | sim | sim | sim: histórico, SI e Gate 046 financeiro, todos 0 GET no gate | não | Gate 046 preflight 35916999807; `READY_FOR_EXPLICIT_AUTHORIZATION`; cofre privado pronto | cada novo request futuro exige novo preflight/autorização; parser não exige rede |
| M5-D Prontidão da credencial Portal | sim | sim | sim: HTTP 200 observado no endpoint recomendado pela CGU | não | run 35910916588; fingerprint `37c90b...a8092`; `ACCEPTED_ON_OBSERVED_REQUEST`; `activeVerified=true` | atividade da chave comprovada; falta provar endpoint financeiro específico |
| Portal da Transparência / captura M4b | sim, aquisição + custódia + schema + parser + normalização live + binding M5-I | sim | sim: 2xx financeiro + 1 registro normalizado e resselado | não | Gate 046 + M5-H run 35931108034; `normalizationSha256=f7306be0...bcfa7` | integrar fonte normalizada na Fase B; correlação ainda separada |
| Aquisição PNCP controlada | sim | sim | sim | não | capture 35547609136 → observação 35932200063 → normalização 36026221085, sem novo GET | expansão gradual e orçamento operacional |
| Disponibilidade da fonte | sim | sim | parcial | não | PR #71 | política de retentativa/alerta em serviço |
| Classificador de sinais | parcial | sim, sintético | não | não | fixtures e testes | precisão/recall e calibração em dados reais |
| Ingresso investigativo automático | sim, fechado por gate | sim | não | não | guardrails dos probes | primeiro piloto ponta a ponta |
| Verificação adversarial | sim | sim | parcial | não | piloto controlado e malha | prova vinculada ao PNCP ao vivo |
| Custódia criptografada | sim | sim | sim | parcial | Portal normalizado + PNCP normalizado; PNCP run 36026221085 `STORED_PRIVATE` receipt `00d024c3...b9447` | rotação/gestão operacional e WORM futuro |
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
