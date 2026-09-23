# ARCA — Roadmap detalhado atual

Atualizado em: **2026-09-23**

Base canônica após M2: `0.4.0-rc.1` / `bb006433f21a622aea4aaf618b728a19e4c327f5`

Regra: este arquivo descreve a sequência vigente. Não substituir gates por ativação direta.

## Regra transversal — idioma oficial e Atlas Técnico Vivo

- **Português brasileiro (pt-BR) é o idioma padrão obrigatório do projeto para todo conteúdo humano novo ou significativamente alterado.**
- Exceções apenas por compatibilidade técnica: nomes oficiais, identificadores, campos de API/protocolo, mensagens exatas de erro e código.
- Documentos históricos em inglês serão migrados gradualmente quando forem tocados.
- Toda mudança arquitetural significativa deve atualizar o **Atlas Técnico Vivo** e, se houver impacto operacional, o runbook correspondente.
- Fonte humana: `docs/ARCA_ATLAS_TECNICO_VIVO_V0_1.md`.
- Inventário legível por máquina: `docs/atlas/ARCA_ATLAS_COMPONENTES_V0_1.json`.
- Política de idioma: `docs/ARCA_POLITICA_IDIOMA_PT_BR.md`.

## Marco M0 — Fundação multifonte offline

Estado: **CONCLUÍDO E INTEGRADO À `main`**

Entregas:

- contrato `Public Source Adapter V1`;
- `Evidence Envelope V1`;
- registro com PNCP, Portal da Transparência, Transferegov, CEIS/CNEP, Siconfi, TCU, DOU e FNDE;
- PNCP offline executável ao fechar M0; o Portal é acrescentado no M1;
- fixture `AC/AL/AM` com deduplicação e indisponibilidade isolada;
- dois agentes independentes;
- verificação adversarial;
- fila em `HUMAN_REVIEW`;
- rede/publicação desligadas.

Prova final: PR [#74](https://github.com/uknwplayer/ARCA/pull/74), commit canônico [`9182249`](https://github.com/uknwplayer/ARCA/commit/9182249bffbc7d4dbf96e314720e77b840f22933) e CI pós-merge [35647349010](https://github.com/uknwplayer/ARCA/actions/runs/35647349010) verde.

Aceite: concluído.

## Marco M1 — Segundo adaptador offline

Estado: **CONCLUÍDO E INTEGRADO À `main`**

Objetivo: implementar a variante oficial de download `br.portal-transparencia.download-despesas` sem realizar rede.

Passos:

1. congelar fixture pública sintética compatível com o contrato oficial;
2. normalizar órgão, fornecedor, período, documento de despesa e valor;
3. emitir o mesmo `Evidence Envelope V1`;
4. bloquear execução se o registro ainda estiver `DECLARED_ONLY`;
5. promover para `ACTIVE/OFFLINE_FIXTURE` somente junto com testes;
6. provar origem oficial, hashes e lacunas;
7. manter material bruto fora do relatório e publicação off.

Resultado: adaptador executa uma fixture de linhas sintéticas com colunas documentadas de pagamento; recusa origem divergente, valor ou data inválidos, campos extras e fonte declarada sem permissão. Emite envelopes hash-only; a UF do ensaio não representa localização comprovada da despesa. A leitura de CSV real e as relações pagamento ↔ empenho ainda não foram implementadas.

Aceite: [PR #76](https://github.com/uknwplayer/ARCA/pull/76), commit [`68f2a0e`](https://github.com/uknwplayer/ARCA/commit/68f2a0e86f60400b0a208c0b2c06599a1601f177), CI da PR [35649925658](https://github.com/uknwplayer/ARCA/actions/runs/35649925658) e CI pós-merge [35650058116](https://github.com/uknwplayer/ARCA/actions/runs/35650058116) verdes. Ver `docs/ARCA_PORTAL_EXPENSES_OFFLINE_M1.md`.

## Marco M2 — Correlação PNCP ↔ execução financeira

Objetivo: relacionar registros sem declarar equivalência apenas por nome ou valor.

Estado: **CONCLUÍDO E INTEGRADO À `main`**.

Entregas:

1. fixture sintética com PNCP, documentos de pagamento e empenhos impactados, incluindo relação um-para-muitos;
2. identificadores canônicos hash-only para órgão e fornecedor;
3. namespaces controlados para CNPJ/SIAFI e dados de fixture;
4. pontes fortes separadas de candidatos;
5. estados `CONFIRMED`, `CANDIDATE`, `CONFLICTING` e `NOT_OBSERVED`;
6. explicações alternativas e diferença temporal;
7. `NOT_OBSERVED` explicitamente separado de desaparecimento ou irregularidade;
8. proveniência e contraprova por vínculo;
9. rede e publicação bloqueadas.

Aceite: [PR #79](https://github.com/uknwplayer/ARCA/pull/79), commit [`bb00643`](https://github.com/uknwplayer/ARCA/commit/bb006433f21a622aea4aaf618b728a19e4c327f5), CI da PR [35690853847](https://github.com/uknwplayer/ARCA/actions/runs/35690853847) e CI pós-merge [35690990372](https://github.com/uknwplayer/ARCA/actions/runs/35690990372) verdes. Validador M2: 1 caso de cada estado, um pagamento impactando dois empenhos, nenhuma conclusão adversa automática.

## Marco M3 — Gate offline multifonte completo

Estado: **CONCLUÍDO E INTEGRADO À `main`**.

Objetivo: repetir o piloto com PNCP + execução financeira e integrar o correlator M2 ao fluxo multiagente.

Passos:

1. três UFs sem município padrão;
2. orçamento fixo de registros;
3. deduplicação entre solicitações humanas e observador;
4. dois agentes independentes com separação de rascunho;
5. verificador adversarial;
6. Human Review Queue;
7. métricas de cobertura, correlação, conflito e ausência;
8. publicação desligada.

Aceite: execução determinística e relatório sanitizado, [PR #81](https://github.com/uknwplayer/ARCA/pull/81), commit [`d10d851`](https://github.com/uknwplayer/ARCA/commit/d10d8516ec05c8e1c8378159ed6459da966a61fb), CI da PR [35695562784](https://github.com/uknwplayer/ARCA/actions/runs/35695562784) e pós-merge [35695672043](https://github.com/uknwplayer/ARCA/actions/runs/35695672043) verdes. Ver checkpoint final `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_008.md`.

## Linha S1 — Expansão de fontes públicas: Transferegov

Estado: **INTEGRADO À `main` / PR #179 / OFFLINE FIXTURE / ZERO REDE**.

O novo ambiente oficial de APIs de Dados Abertos do Transferegov.br passa a ser a terceira fonte executável do núcleo offline no snapshot `config/public-source-registry-s1.json`, começando por Transferências Especiais. O registro histórico V1 permanece congelado para preservar as provas M0/M1. No snapshot S1, `br.transferegov.public` aponta para `https://api-publica.transferegov.gestao.gov.br/`, permanece sem `PUBLIC_GET` e aceita somente `OFFLINE_FIXTURE`.

Entregas V0.1:

- adaptador estrito para fixture sintética;
- campos de transferência, emenda, ente beneficiário, UF/município, referência de autor, valores, estado e atualização;
- Evidence Envelopes hash-only;
- budgets e rejeição de campos/origens/UF inconsistentes;
- indisponibilidade sem geração de suspeita;
- integração ao Gate Offline Multifonte V1;
- revisão humana obrigatória e publicação desligada.

Limites: transferência/pagamento não prova contratação, entrega física, regularidade ou cumprimento de objeto. Referência de parlamentar é contexto documental, nunca conclusão adversa. O schema live ainda precisa de gate próprio.

Depois de S1, a sequência de expansão prevista é TCU → Siconfi → CEIS/CNEP → DOU → FNDE, sempre começando offline e sem competir com o Gate 042 do Portal.

Ver `docs/ARCA_TRANSFEREGOV_SPECIAL_TRANSFERS_OFFLINE_V0_1.md` e checkpoint 043.

## Linha S2 — TCU Acórdãos offline

Estado: **INTEGRADO À `main` / PR #180 / OFFLINE FIXTURE / ZERO REDE**.

O snapshot `config/public-source-registry-s2.json` preserva S1 e ativa `br.tcu.open-data` para `OFFLINE_FIXTURE`, usando o webservice oficial de Acórdãos do TCU.

Entregas:

- adaptador offline estrito para o schema documentado de Acórdãos;
- fixture sintética nacional;
- suporte compatível de Evidence Envelope a `BR/NATIONAL`;
- hashes/proveniência sem material bruto;
- teste de datas, URLs TCU, campos inesperados e source fail-closed;
- validador `npm run validate:tcu-s2`;
- etapa própria no CI.

Limites: acórdão é contexto documental e deve ser lido com processo, situação, recursos e decisões posteriores; nunca vira automaticamente prova de irregularidade atual. S2 não habilita `PUBLIC_GET`.

Depois do S2, a fila é S3 Siconfi → S4 CEIS/CNEP → S5 DOU → S6 FNDE.

Ver `docs/ARCA_TCU_ACORDAOS_OFFLINE_S2.md` e checkpoint 044.

## Marco M4 — Live controlado de uma fonte por vez

Estado: **M4a/M4b integrados; autenticação atual do Portal comprovada em probe separado: Gate 040-SI `35910828041` + exatamente 1 GET a `/api-de-dados/situacao-imovel` no run `35910916588`, HTTP 200, `activeVerified=true`, zero retry e custódia privada; os quatro GETs históricos de `documentos-relacionados` permanecem 401 e esse endpoint não foi retestado após a ativação da chave; nenhum novo GET autorizado**. M4a: [PR #84](https://github.com/uknwplayer/ARCA/pull/84), commit [`d36df26`](https://github.com/uknwplayer/ARCA/commit/d36df26a45d736f1fdc605721426b3a8b228d4ba), CI da PR [35745211122](https://github.com/uknwplayer/ARCA/actions/runs/35745211122) e pós-merge [35745354987](https://github.com/uknwplayer/ARCA/actions/runs/35745354987), ambos verdes. PR #88 integrada no commit `03d1465034de1151b7add59ab2b404a14f11fe72`; CI pós-merge run `35798543860` verde. Ver [checkpoint 013](checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_013.md), `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md` e checkpoint 011.

Pré-condições:

- M0–M3 verdes;
- cofre privado durável disponível;
- autorização explícita e limitada;
- timeout, página, registros e retries pré-registrados;
- nenhum segredo em log/artefato público.

Ordem:

1. PNCP: um shard, uma página, poucos registros;
2. Portal da Transparência: consulta mínima separada;
3. nenhuma correlação live no primeiro acesso;
4. validar custódia antes de classificar;
5. emitir somente recibos sanitizados.

Entrega M4b canônica: contrato oficial, transporte limitado, custódia privada durável e workflow manual estão integrados. Quatro GETs históricos de `documentos-relacionados` retornaram 401. A CGU confirmou depois que a chave estava inativada e a ativou, além de informar intermitência conhecida nesse endpoint. Sob nova autorização específica, o Gate 040-SI `35910828041` passou sem rede e o run `35910916588` executou exatamente um GET no endpoint de validação `/api-de-dados/situacao-imovel`: HTTP 200, `ACCEPTED_ON_OBSERVED_REQUEST`, `activeVerified=true`, 5 strings válidas, 66 bytes, `retries=0` e `STORED_PRIVATE`. Isso prova a autenticação atual, não a disponibilidade de `documentos-relacionados`. A autorização foi consumida; qualquer novo request exige novo gate e nova autorização humana explícita. A API do Portal cobre execução federal; fontes estaduais/municipais exigem conectores próprios.

Parada imediata: escopo divergente, custódia inválida, segredo ausente, resposta excessiva, ambiguidade de reexecução ou tentativa de publicação.

## Marco M5 — Live correlacionado limitado

Estado: **FASES A+B+C+D+E INTEGRADAS E TESTADAS; AUTENTICAÇÃO PORTAL COMPROVADA NO GATE 045; PRIMEIRO 2xx DE `documentos-relacionados` OBTIDO NO GATE 046 / RUN `35917902630`; 1 REGISTRO, 440 BYTES, SCHEMA OBSERVADO, CUSTÓDIA PRIVADA; PARSER AINDA NÃO ADMITIDO; NENHUM NOVO GET AUTORIZADO**.

Objetivo: uma investigação técnica fechada, sem acusação e sem publicação.

Passos:

1. pré-registrar uma contratação;
2. adquirir PNCP e execução financeira separadamente;
3. correlacionar apenas após custódia;
4. registrar não selecionados e lacunas;
5. executar dois agentes;
6. executar verificação adversarial;
7. enviar à revisão humana;
8. produzir métricas, não veredito.

Aceite: cadeia completa auditável e revisão humana registrada.

### M5 Fase B — post-custody correlation

Estado: **INTEGRADO E TESTADO OFFLINE / PR #155 / CI #328 E #329 VERDES**.

A Fase B implementa e testa o trecho `pre-correlation READY → bundle normalizado vinculado à custódia → correlação → dois analistas independentes → verificação adversarial → HUMAN_REVIEW`.

Ela não executa rede e registra explicitamente `m5Accepted:false`. Dados normalizados só entram no correlator se carregarem as âncoras dos envelopes de custódia; bridges fortes exigem proveniência das duas fontes. Ver `docs/ARCA_M5_POST_CUSTODY_CORRELATION_V0_1.md`.

O bloqueio de autenticação foi removido no Gate 045 e o primeiro 2xx de `documentos-relacionados` foi obtido no Gate 046. O bloqueio atual do M5 é exclusivamente offline: admitir um parser/normalizador compatível com o schema observado, provar fail-closed em drift e somente então alimentar a Fase B com evidência live já custodial. O CI canônico agora executa explicitamente `validate:m5-phase-a` e `validate:m5-phase-b`.


### M5 Fase C — observação estrutural do schema Portal

Estado: **INTEGRADO E TESTADO OFFLINE / PR #162 / CI #339 E #340 VERDES / nenhum novo GET**.

A Fase C prepara o primeiro 2xx real do Portal para observação segura antes da normalização. Ela opera somente depois da custódia e produz um resumo estrutural sem valores: raiz, campos, tipos, presença e hashes vinculados ao scope, resposta, envelope e recibo.

Integração canônica no probe M4b:

`2xx → custódia verificada → reabertura byte a byte → observação estrutural → validação DTO atual`.

Se houver schema drift, os bytes continuam custodiais e a estrutura pode ser registrada para revisão, mas nenhum parser é adaptado automaticamente. Mesmo uma revisão `APPROVE_FOR_PARSER_DESIGN` não autoriza implementação, normalização, nova rede ou publicação.

Ver `docs/ARCA_M5_PORTAL_SCHEMA_OBSERVATION_V0_1.md`. O CI canônico executa `validate:m5-phase-c` junto de M5-A e M5-B.

### M5 Fase D — prontidão verificável da credencial Portal

Estado: **INTEGRADO E TESTADO OFFLINE / PR #165 / CI #343 E #344 VERDES / nenhum novo GET**.

A Fase D separa presença, formato, procedência declarada e atividade real da credencial. O token nunca é impresso; um fingerprint SHA-256 com separação de domínio permite distinguir credenciais entre probes.

Antes de rede, o estado obrigatório é `ACTIVE_UNKNOWN` e `activeVerified=false`. A procedência exigida é `OFFICIAL_EMAIL_REGISTRATION`, conforme o fluxo oficial atual de cadastro de e-mail e recebimento do token.

Uma resposta 401 deve ser registrada como `AUTHORIZATION_NOT_ESTABLISHED`; ela não prova sozinha a causa da falha e não autoriza retry. Apenas um 2xx observado em request explicitamente autorizado pode marcar `ACCEPTED_ON_OBSERVED_REQUEST`.

Ver `docs/ARCA_M5_PORTAL_CREDENTIAL_READINESS_V0_1.md`. O CI canônico executa `validate:m5-phase-d` junto dos gates M5-A/B/C.

### Gate 040 — preflight Portal isolado sem captura

Estado: **IMPLEMENTADO E TESTADO / PR #168 / CI #348 E #349 VERDES / PROVA OPERACIONAL COM SECRETS REAIS CONCLUÍDA NO RUN `35884318441` / zero GET Portal**.

Prova operacional sanitizada:
- revisão: `133e7943e1eac9d90be79652d7544787ba1613fa`;
- `scopeHash`: `06702c06faac9eea05c6ce5e7a0577dec807d33edeb23750c8d6a66b98710685`;
- `preflightSha256`: `8fbf3113c6d30895b05d31d9c3a6483ae320cd627b0d17984fc1e6d202dc0356`;
- `credentialFingerprintSha256`: `37c90b46b7e1a4fcf699aee3f94979829cb044d13979cfbf05a229cd869a8092`;
- `credentialActiveState=ACTIVE_UNKNOWN`;
- `custodyReady=true`, `custodyPrivate=true`;
- `portalNetworkUsed=false`, `portalNetworkAuthorized=false`, `portalRequestCapabilityPresent=false`.

Esse conjunto de hashes foi consumido pelo quarto GET do run `35886041113`. Como qualquer alteração documental posterior muda a revisão, ele passa a ser histórico. Qualquer novo request exigirá novo Gate 040 e nova autorização humana separada.

Objetivo: validar a credencial, o escopo derivado e a disponibilidade do cofre em um workflow que não possui etapa de captura nem importa o transporte do Portal.

O workflow usa o token somente via GitHub Secret. Proveniência e instante de recebimento entram como parâmetros da execução e não são hardcoded no repositório.

Saída sanitizada esperada:

- `READY_FOR_EXPLICIT_AUTHORIZATION`;
- `ACTIVE_UNKNOWN`;
- fingerprint SHA-256 da credencial;
- `scopeHash`;
- cofre privado pronto;
- `portalNetworkUsed=false`;
- `portalRequestCapabilityPresent=false`;
- `humanAuthorizationRequired=true`.

Mesmo sucesso neste gate **não autoriza o quarto GET**.

`.github/workflows/arca-portal-isolated-preflight.yml`

`scripts/arca-portal-isolated-preflight.mjs`

`npm run validate:portal-isolated-preflight`

### Gate 042 — diagnóstico offline do quarto 401

Estado: **RESOLVIDO QUANTO À ATIVAÇÃO DA CHAVE / ISSUE #176 PRESERVADA COMO HISTÓRICO**.

O run `35886041113` provou a cadeia de autorização/binding/custódia, mas o Portal respondeu HTTP 401. A prova sanitizada registrou `AUTHORIZATION_NOT_ESTABLISHED`, `credentialInvalidProven=false`, 169 bytes de resposta, `retries=0` e `STORED_PRIVATE`.

Revalidação offline atual:
- chave usada no Secret coincide com a chave do e-mail oficial mais recente por fingerprint;
- header enviado é `chave-api-dados`;
- endpoint `/api-de-dados/despesas/documentos-relacionados` segue publicado no Swagger oficial;
- método é GET e o host é o oficial;
- não há evidência suficiente para atribuir causa específica ao 401.

Resultado do suporte: a CGU confirmou que a chave estava inativada, ativou-a e informou que `documentos-relacionados` apresenta intermitência. O teste diferencial foi então feito no endpoint recomendado pela própria equipe, `/api-de-dados/situacao-imovel`, sob Gate 040-SI e autorização específica: HTTP 200 no run `35910916588`. A falha geral de autenticação está resolvida; a saúde de `documentos-relacionados` continua não comprovada após a ativação. Nenhuma nova execução está autorizada.

Ver `docs/ARCA_PORTAL_401_SUPPORT_DOSSIER_2026-09-23.md` e issue #176.

### Gate 045 — validação controlada da autenticação Portal

Estado: **CONCLUÍDO / HTTP 200 / AUTORIZAÇÃO CONSUMIDA**.

Após a CGU informar que a chave estava inativada e foi ativada, foi criada uma trilha independente de validação no endpoint recomendado pela equipe: `GET /api-de-dados/situacao-imovel`.

Gate 040-SI canônico: run `35910828041`, revisão `9ccf812bad58b1674a48973fb15869a11cb53467`, `preflightSha256=873b69ca46e0e061b2ee90203904f8a48c47e512a0fadae656078c3efd955587`, zero rede.

Probe live: run `35910916588`, mesma revisão, exatamente 1 GET, HTTP 200, `ACCEPTED_ON_OBSERVED_REQUEST`, `activeVerified=true`, 5 strings validadas, 66 bytes, `retries=0`, resposta selada e `STORED_PRIVATE`.

Conclusão: a chave atual funciona. Isso não comprova a disponibilidade do endpoint `documentos-relacionados`, que a CGU informou estar intermitente. A autorização deste probe foi consumida. Qualquer próximo GET requer novo Gate e nova autorização humana explícita.

Ver `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-23_045.md`.

### Gate 046 — primeiro 2xx financeiro do Portal

Estado: **CONCLUÍDO / HTTP 200 / SCHEMA OBSERVADO / AUTORIZAÇÃO CONSUMIDA**.

Preflight canônico: run `35916999807`, revisão `44b2dd9b5bc25c216d9b599fb552ea0fbb063c5f`, `scopeHash=38637de67d7f7eb5a5fc57fa327069c20857bd7ae7ed62b8072312a2fad37eb1`, `preflightSha256=1e07709d9fbdbcc079fb2e6f244784714ddf075b09bf5502b151afacb639f99f`, zero rede.

Probe live: run `35917902630`, mesma revisão, exatamente 1 GET a `/api-de-dados/despesas/documentos-relacionados`, HTTP 200, 1 registro, 440 bytes, `VALIDATED`, `ACCEPTED_ON_OBSERVED_REQUEST`, `retries=0`, resposta selada e `STORED_PRIVATE`.

O observador M5-C registrou um array com 1 objeto e os campos `data`, `documento`, `documentoResumido`, `elementoDespesa`, `especie`, `fase`, `favorecido`, `orgaoSuperior`, `orgaoVinculado`, `unidadeGestora` e `valor`, todos observados como string. Valores e bytes crus não foram publicados; normalização não foi feita; `parserAdmitted=false`.

Próximo passo: fixture sintética baseada somente na estrutura observada → parser/normalizador offline → testes de drift/data/valor → revisão humana → admissão na Fase B. Nenhum novo GET é necessário para essa etapa.

Ver `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-23_046.md`.

### M5 Fase E — binding do preflight ao probe live

Estado: **INTEGRADO E TESTADO OFFLINE / PR #173 / CI #356 E #357 VERDES / nenhum quarto GET**.

A Fase E amarra o workflow live ao resultado exato do Gate 040. O preflight passa a emitir `preflightSha256`, e o probe live exige `scope_sha256 + preflight_sha256 + credential_fingerprint_sha256`.

Antes de qualquer request, o probe recalcula a atestação a partir da revisão, documento, credencial e cofre atuais. Qualquer divergência falha fechado e o transporte HTTP nem é criado.

Isso impede reutilizar uma autorização depois de trocar token, documento, revisão ou cofre.

Ver `docs/ARCA_M5_PORTAL_PREFLIGHT_BINDING_V0_1.md`. O CI canônico executa `validate:m5-phase-e` junto de M5-A/B/C/D e do validador do Gate 040.

## Marco M5-R — Public Investigation & Referral Dossier

Estado: **MÉTODO V0.1 DOCUMENTADO; IMPLEMENTAÇÃO EXECUTÁVEL PENDENTE**.

Objetivo: transformar uma investigação pública correlacionada e revisada em um dossiê técnico reproduzível de encaminhamento, sem acusação automática, veredito, protocolo autônomo ou ampliação da autoridade de acesso do ARCA. Ver `docs/ARCA_PUBLIC_INVESTIGATION_REFERRAL_METHOD_V0_1.md`.

Dependências obrigatórias:

- M5 aceito com aquisição correlacionada e custódia válida;
- dois agentes independentes e verificação adversarial executados;
- fatos, alegações, relações, hipóteses, contraprovas e achados oficiais separados;
- revisão humana registrada;
- controles de privacidade e fronteira de publicação ativos.

Implementação incremental:

1. schema versionado do registro e do `Referral Dossier`;
2. validador fail-closed de completude, estados epistêmicos e `PUBLIC_TRAIL_END`;
3. reconciliação de categorias financeiras, estornos, períodos parciais e duplicidades;
4. renderer determinístico com cronologia, fontes, hashes, relações, inconsistências, hipóteses concorrentes e contraprovas;
5. controle de dados protegidos, minimização e descrição segura das lacunas;
6. revisão humana obrigatória para exportação e decisão separada para encaminhamento;
7. manifesto criptográfico e exportação pública higienizada;
8. testes exclusivamente sintéticos, incluindo falsos positivos, fontes indisponíveis e trilhas públicas incompletas.

Limites:

- `PUBLIC_TRAIL_END` registra limite probatório e nunca culpa ou irregularidade;
- o dossiê não concede acesso bancário, fiscal, telemático, médico ou judicial protegido;
- não há invasão, engenharia social, abuso de credenciais, interceptação, compra/uso de vazamentos ou tentativa de superar sigilo;
- nenhuma autoridade recebe material sem decisão humana específica;
- nenhuma acusação, denúncia, publicação, protocolo ou pedido de quebra de sigilo é automático.

Aceite futuro: schema e validador verdes; renderer reproduzível; dados protegidos recusados; contraprovas preservadas; revisão humana vinculada; pacote higienizado aprovado em testes sintéticos; nenhuma ação externa automática.

M5-R não altera o caminho crítico atual. O gate imediato é corrigir a autenticação da API e registrar nova autorização limitada antes de qualquer novo GET; M5-R somente começa após o aceite de M5.

## Linha paralela V/E — Vince Pathfinder + ARCA Edge Steward

Estado: **VINCE V0.4 IMPLEMENTADO; V1–V3.1 LIVE-PROVEN; V3.2 TESTADO OFFLINE; V4 HETEROGÊNEO GITHUB↔REPLIT LIVE-PROVEN LIMITADO; V4.1 TERMUX ATTESTED LIVE-PROVEN; V4.1.1 DURABLE REPLAY LIVE-PROVEN; V5 AVAILABILITY FOUNDATION + WORK READ-ONLY LIVE-PROVEN; EDGE STEWARD CONGELADO**.

Objetivo conjunto: ampliar a capacidade do ARCA de descobrir ambientes/agentes autorizados, estabelecer rotas verificáveis de execução e retorno, recuperar continuidade após falhas e manter uma presença operacional leve e recuperável, sem transformar descoberta em autoridade.

### Futuro — ARCA AI Gateway / OpenAI-compatible

Estado: **PLANEJADO / CONGELADO ATÉ SOLICITAÇÃO EXPLÍCITA DO USUÁRIO / NÃO COMPETE COM M5**.

Objetivo: desacoplar o ARCA de um fornecedor/modelo específico. A primeira rota futura pode ser a OpenAI API, sem servidor próprio, com custo por uso e budgets explícitos. O mesmo contrato poderá futuramente apontar para modelos locais, servidores próprios ou outros providers compatíveis.

Regras:

- preços/modelos não são congelados no roadmap; devem ser reconsultados no momento da ativação;
- billing da API é tratado como custo operacional separado;
- budget por missão/período;
- roteamento por capability/custo;
- descoberta não concede trust;
- nenhuma API key ou chamada é ativada por inferência.

Documento canônico: `docs/ARCA_AI_GATEWAY_OPENAI_COMPATIBLE_V0_1.md`.

### Futuro — ARCA Device Agent / Runtime Autônomo Local

Estado: **PLANEJADO / CONGELADO / NÃO COMPETE COM M5**. **Caminho preferencial: ARCA Device Agent. Runtime Autônomo Local permanece congelado até solicitação explícita do usuário.**

Objetivo: permitir que o dispositivo do operador exponha capabilities locais explícitas ao ARCA sem transformar o telefone em shell irrestrito e, em uma variante futura, permitir execução autônoma local independente da nuvem.

Níveis de autoridade planejados:

1. **Nível 1 — ARCA only**
   - health/status do ARCA;
   - start/stop/restart de workers allowlisted;
   - leitura de logs do ARCA;
   - Git pull/status em caminhos autorizados;
   - leitura/escrita somente em diretórios ARCA allowlisted.

2. **Nível 2 — Termux**
   - capabilities Linux adicionais explicitamente cadastradas;
   - processos, rede, arquivos e diagnósticos dentro do sandbox/ambiente Termux;
   - sem shell arbitrário por padrão;
   - deny-by-default e revisão para expansão de capabilities.

3. **Nível 3 — Device**
   - app/serviço Android próprio para capabilities específicas do dispositivo;
   - integração futura com APIs do Android e, quando apropriado, Accessibility/serviços equivalentes;
   - permissões separadas por capability;
   - nenhuma equivalência automática a controle total do aparelho.

Arquitetura operacional planejada:

```text
ChatGPT/operador
      ↓
Machine Bridge / Vince
      ↓
ARCA Device Agent
      ↓
catálogo de capabilities
      ↓
Termux / ARCA / Android
      ↓
resultado assinado + auditoria
```

O Device Agent deve possuir:

- identidade criptográfica própria;
- capability catalog versionado;
- autorização deny-by-default;
- revogação;
- replay protection;
- leases/expiração;
- watchdog;
- limites de CPU/RAM/bateria/temperatura;
- modo ocioso opcional;
- logs auditáveis;
- kill switch local;
- atualização assinada;
- recuperação fail-closed;
- separação entre controle do ARCA e controle do dispositivo.

#### Runtime Autônomo Local

Variante futura para independência operacional da nuvem:

- **modo híbrido**: modelo/assistente em nuvem decide; Device Agent executa localmente;
- **modo local**: um modelo de pesos abertos/localmente executável roda no dispositivo ou servidor próprio;
- **modo soberano**: memória, ferramentas, scheduler, policies, watchdog e modelo rodam em infraestrutura controlada pelo operador.

Regra conceitual: um modelo local independente **não é a mesma instância do ChatGPT transferida para o telefone**. É outro runtime/modelo, ainda que possa reutilizar protocolos, memória exportável permitida, Atlas, policies e estilo operacional do ARCA.

Pré-condição para descongelamento do Device Agent: núcleo ARCA funcional e decisão humana explícita. A implementação deve começar no Nível 1 e só avançar de autoridade após provas e revisão.

O **Runtime Autônomo Local** possui regra mais forte: permanece congelado até **solicitação explícita do usuário**, independentemente de o ARCA já estar funcional.

Documento canônico: `docs/ARCA_DEVICE_AGENT_RUNTIME_LOCAL_V0_1.md`.

### Vince — Scout / Broker / Pathfinder / Recovery Agent

#### Futuro: Vince Discovery Global / Connectivity Investigator

Estado: **PLANEJADO / NÃO ATIVO / NÃO COMPETE COM M5**.

Vince poderá futuramente procurar agentes, workers, runners, APIs, serviços de IA e infraestrutura **globalmente**, inclusive em ecossistemas chineses. A origem geográfica não concede nem reduz confiança automaticamente. Descoberta não equivale a admissão: qualquer candidato deverá passar por identidade/descriptor, capabilities, política, teste isolado e evidência antes de poder integrar o ARCA.

O Connectivity Investigator poderá investigar falhas de integração por documentação oficial, mudanças de endpoint, headers, tokens, OAuth/API key, status de serviço e rotas públicas equivalentes. Não poderá burlar autenticação, explorar vulnerabilidades, abusar de credenciais ou acessar áreas protegidas. No caso do Portal da Transparência, seu papel futuro seria procurar a rota oficial correta ou alternativa pública legítima, nunca “forçar entrada”.

Ver `docs/ARCA_VINCE_DISCOVERY_GLOBAL_V0_1.md`.

### Vince — Scout / Broker / Pathfinder / Recovery Agent

Vince será formalizado como camada de descoberta e roteamento sobre capacidades já existentes do ARCA, reutilizando `Agent Gateway`, descoberta A2A, `Execution Endpoint`, Machine Bridge, Event Fabric, identidade de execução, reconciliação de evidência remota e failover reconciliado.

Funções planejadas:

1. descobrir endpoints, agentes e workers apenas por superfícies públicas/allowlisted ou explicitamente conectadas;
2. verificar descriptor, identidade disponível, capabilities e política antes de admitir uma rota;
3. selecionar caminhos por capacidade, disponibilidade e limites operacionais;
4. transportar um envelope mínimo de missão com identidade, objetivo, estado/checkpoint, permissões, prova requerida e rota de retorno;
5. acompanhar ACK, resultado e evidência sem confundir wake, claim, execução ou autoridade;
6. recuperar missões interrompidas por checkpoint/reconciliação e, quando permitido, encaminhá-las a outro executor sem duplicação;
7. registrar saúde/reputação operacional baseada em evidências observadas, sem converter autoalegações de agentes em confiança.

Princípio do futuro Portal Protocol:

`identidade + missão + estado + permissões + checkpoint + retorno + prova`.

Se o mesmo processo não puder retornar, a continuidade poderá ser reconstruída por outra instância somente a partir de estado durável verificável. Reconstrução não deve ser apresentada como prova filosófica de identidade/consciência; no ARCA ela significa continuidade operacional auditável.

Fases propostas:

- V0: **IMPLEMENTADO** — envelope, permissões, checkpoint, ACK e prova reconciliada;
- V1: **LIVE-PROVEN LIMITADO** — discovery/ranking baseado no registry canônico para rotas allowlisted;
- V2: **LIVE-PROVEN LIMITADO** — probe/ACK/resultado em `github-satellite-linux`, runs `35808000764` / `35808010876`;
- V3: **LIVE-PROVEN LIMITADO** — failover A→B após falha transitória pré-aceitação, sem DispatchRef em A e sem duplicação; runs `35809204841` / `35809214584`;
- V3.1: **LIVE-PROVEN LIMITADO** — recovery em runner novo a partir de checkpoint durável e DispatchRef original, sem redispatch; runs `35810698274` / `35810708455`;
- V3.2: **IMPLEMENTADO / TESTADO OFFLINE** — checkpoint/proof revalidados no Machine Bridge, Execution Identity create-only e recibo Ed25519 em domínio dedicado; prova live aguarda signer persistente;
- V4: **LIVE-PROVEN LIMITADO** — `vince-v4-live-005` atravessou GitHub/ARCA → Replit → GitHub e foi verificado canonicamente; request `c069…`, result `3ded…`, proof `daea9c2c…`; worker attestation ainda é false;
- V4.1: **LIVE-PROVEN LIMITADO** — Android/Termux one-shot com identidade Ed25519 pinada, challenge, resultado assinado e `ATTESTED_VERIFIED_RESULT`; run `35830210570`, proof `5112d8a0…`.
- V4.1.1: **LIVE-PROVEN / CONCLUÍDO** — registry durável de challenges aceitos, preflight replay fail-closed, compare-and-swap pelo blob SHA e read-after-write; PR #134, commit `384895a`; replay proof run `35832175245` rejeitou a prova 006 em processo novo com `VINCE_V41_CHALLENGE_REPLAY`, `DURABLE_REPLAY_REJECTED` e `workerReexecuted:false`.
- V5: **TERMUX A/B LIVE-PROVEN / WORK READ-ONLY PRESERVADO** — o modelo de disponibilidade/roteamento foi generalizado para execução verificável; o Probe 010 provou duas leases Ed25519 `READY`, seleção de A por evidência mais recente, retirada assinada de A e seleção de B como único elegível, sempre com `dispatchPerformed:false`. Work continua candidato opcional e a prova 008 permanece histórica.

Dependência Work atual: a superfície GitHub/PR configurada foi comprovada alcançável em modo read-only, mas a ligação nativa do evento GitHub ao ChatGPT Work no repositório `uknwplayer/ARCA` ainda não possui ACK canônico recente. Ver PR #90, issue #138 e proof 008. Vince deve manter Work como endpoint candidato, não `AVAILABLE`, até existir wake + ACK correlacionado dentro da janela de freshness.

Limites: sem varredura arbitrária, abuso de credenciais, shell genérico, expansão automática de rede/autoridade, merge, `main.write`, `trust.modify`, publicação investigativa ou acesso a fontes protegidas por inferência.

### ARCA Edge Steward

O Edge Steward permanece preservado no draft PR #78 e **continua congelado** conforme decisão vigente. Seu papel futuro é fornecer presença recuperável 24/7 no Android/Termux e compute oportunista limitado, outbound-only e preemptável quando o usuário retoma o aparelho.

Relação com Vince:

- Vince descobre, seleciona, encaminha e recupera rotas;
- Edge Steward mantém presença local leve, observa estado, reconcilia e pode executar apenas capabilities locais allowlisted;
- nenhum deles recebe autoridade automática de merge, escrita canônica, trust ou shell arbitrário;
- o Steward pode futuramente hospedar uma instância limitada do Vince, mas isso exige contrato próprio e não é pressuposto deste roadmap.

Gate de reativação do Edge Steward: somente depois de o núcleo investigativo provar operação live real e cadeia M5 aceita, salvo decisão explícita posterior do Criador. Até lá, documentação e arquitetura podem ser preservadas, mas implementação móvel não compete com M4/M5.

### V5-Termux A/B — rota sem dependência de cota

Estado: **LIVE-PROVEN / SELEÇÃO E FAILOVER LÓGICO A→B / ZERO DISPATCH**.

Decisão operacional: Replit passa a ser somente evidência histórica do V4 e não é dependência operacional do Vince. ChatGPT Work permanece endpoint opcional e pode ficar indisponível por cota sem bloquear o Vince. O caminho prioritário de teste V5 passa a usar dois workers Termux logicamente independentes, com identidades Ed25519 e leases de presença assinadas separadas.

O Probe 010 provou seleção sem dispatch e troca controlada A→B: A+B `READY` produziram 2 candidatos elegíveis e A foi selecionado por evidência mais recente; depois A publicou `WITHDRAWN`, tornou-se não elegível e B foi selecionado como único elegível. Isso prova failover lógico entre identidades/workers; dois workers no mesmo telefone não provam tolerância à perda física do aparelho. GitHub permaneceu transporte/registro; Actions não foi executor do gate.

Ver `docs/ARCA_VINCE_V5_TERMUX_AB_ROUTING_V0_1.md` e `docs/ARCA_VINCE_V5_TERMUX_AB_LIVE_PROOF_010.md`.

Aceite parcial alcançado para Vince V0.1–V0.4 + V4.1.1 + V5 A/B live: discovery, ACK, execução, retorno, failover, recovery pós-crash, rota heterogênea GitHub↔Replit, attestation Ed25519 no Termux, rejeição durável de replay e classificação live read-only de disponibilidade foram provados. V5 recusou corretamente transformar heartbeat de superfície em executor disponível. Work continua endpoint opcional e pode permanecer `INCONCLUSIVE` sem bloquear o Vince. O próximo gate prioritário deixa de ser Work e passa a ser conectar seleção V5 à execução one-shot V4.1.1 com exatamente um request e consumo durável, sem retry/failover automático. Replit deixou de ser dependência operacional. Presença móvel/Edge permanece futura.

### V5→V4.1.1 — selected one-shot execution

Estado: **LIVE-PROVEN / PROBE 011 CONCLUÍDO / SELECTED ONE-SHOT + DURABLE REPLAY**.

O Probe 011 integrou seleção e execução sem Work/Replit: A ficou `WITHDRAWN`, B foi o único elegível, o dispatch foi vinculado a nodeId/fingerprint/request hash/route hash, B executou exatamente um `git-status`, o resultado Ed25519 foi verificado e o challenge foi consumido por CAS/read-after-write no registry V4.1.1.

Replay posterior foi rejeitado com `workerReexecuted:false`. Continua sem retry/failover automático depois do dispatch. Qualquer falha exige reconciliação humana antes de novo request, para evitar execução duplicada. Próximo gate Vince recomendado: redundância física multi-device; não ampliar capability para shell arbitrário.

Ver `docs/ARCA_VINCE_V5_V411_SELECTED_ONESHOT_GATE_V0_1.md` e `docs/ARCA_VINCE_V5_V411_LIVE_PROOF_011.md`.

### FUTURE PATCH — Vince Controlled Self-Improvement

Estado: **CONGELADO ATÉ A CONCLUSÃO DO ARCA**.

Objetivo futuro: permitir que Vince use histórico operacional verificável para propor melhorias de política sem modificar a si mesmo de forma irrestrita.

Arquitetura prevista:

```text
VINCE EXPERIENCE STORE
        │
        ├─ sucessos
        ├─ falhas
        ├─ latência
        ├─ disponibilidade
        ├─ custo
        ├─ categorias de erro
        └─ recuperação necessária
                │
                ▼
       POLICY CANDIDATE
                │
       replay/simulação histórica
                │
       comparação com política vigente
                │
          HUMAN REVIEW
           │         │
         rejeita   admite
                     │
                     ▼
             policy versionada
```

Escopo permitido quando descongelado:

1. registrar experiência operacional objetiva por executor/rota;
2. calcular métricas de confiabilidade, latência, custo, falhas e recuperação;
3. gerar **candidatos** de política de seleção;
4. testar candidatos contra histórico/replay antes de qualquer adoção;
5. preservar explicação, evidência e diferença em relação à policy anterior;
6. exigir revisão humana para promoção da policy;
7. versionar e permitir rollback;
8. nunca converter autoalegação de agente em trust.

Fora de escopo:

- autoedição irrestrita de código;
- alteração autônoma de pesos/policies em produção;
- expansão automática de capabilities;
- criação autônoma de trust;
- shell arbitrário;
- modificação de `main`;
- bypass de revisão humana;
- treino/modificação de pesos de modelo;
- mudança de política investigativa sem gate específico.

Pré-condição para descongelamento: **ARCA concluído conforme os marcos vigentes e decisão humana explícita de reabrir este patch**.

Até lá, Vince permanece no estado live-proven do Probe 011 e nenhuma implementação deste patch deve competir com M5, M5-R, M6–M9 ou demais entregas do núcleo.


## Marco M6 — Expansão territorial gradual

Ordem operacional:

1. três UFs por ciclo;
2. medir disponibilidade, custo, latência e erro;
3. aumentar somente após estabilidade;
4. chegar às 27 UFs mantendo orçamento por shard;
5. município continua sem default;
6. falha de uma UF não bloqueia as demais.

Aceite: ciclos nacionais repetíveis. Não equivale a todos os municípios consultados nem serviço 24/7.

## Marco M7 — Novas famílias de fonte

Prioridade:

1. transferências e convênios (`Transferegov`);
2. sanções (`CEIS/CNEP`);
3. dados fiscais agregados (`Siconfi`);
4. controle externo (`TCU`, depois TCEs/TCMs por conectores próprios);
5. diários oficiais;
6. educação (`FNDE`);
7. saúde e obras, após especificação própria.

Cada fonte passa por: declaração → fixture offline → testes → live isolado → correlação limitada → operação gradual.



### M7-CIV — Inteligência cívica e histórico documental de agentes públicos

Estado: **PLANEJADO / NÃO É CAMINHO CRÍTICO / IMPLEMENTAÇÃO SOMENTE APÓS GATES DO NÚCLEO**.

Relevância: alta para a finalidade investigativa do ARCA, desde que permaneça documental, reproduzível e neutra. O objetivo não é classificar pessoas como “confiáveis” ou “não confiáveis”, mas reconstruir fatos públicos verificáveis e a qualidade das evidências.

Escopo futuro:

1. **Projetos de lei e atividade legislativa**:
   - autoria e coautoria;
   - texto, ementa, temas e versões;
   - tramitação;
   - pareceres;
   - emendas;
   - votações nominais públicas;
   - relações entre proposições;
   - cronologia e resultado legislativo.

2. **Histórico institucional de políticos e servidores/agentes públicos**:
   - mandatos e cargos públicos;
   - funções e órgãos;
   - vínculos institucionais públicos;
   - filiações partidárias quando oficialmente publicadas e relevantes ao registro histórico;
   - atos de nomeação, exoneração, afastamento e sanções quando públicos.

3. **Histórico judicial público**:
   - somente processos e metadados legalmente públicos;
   - classe, tribunal, movimentações, decisões e estado processual quando disponíveis;
   - processos sigilosos ou dados protegidos permanecem fora do alcance;
   - ausência em uma fonte nunca significa ausência de processo.

4. **Histórico criminal público**:
   - somente fatos processuais/decisões oficiais publicamente acessíveis;
   - separar rigorosamente investigação, acusação, denúncia recebida, condenação, absolvição, arquivamento, prescrição, recurso e trânsito em julgado;
   - nunca transformar processo ou acusação em culpa;
   - nenhum “score criminal” ou inferência sobre caráter.

5. **Histórico administrativo e de controle**:
   - sanções administrativas oficialmente publicadas;
   - decisões de tribunais de contas e órgãos de controle;
   - PAD/disciplinar apenas quando legalmente público;
   - CEAF/CEIS/CNEP e outras bases oficiais conforme pertinência e escopo legal;
   - registrar vigência, órgão aplicador, fundamento e estado da sanção.

6. **Confiabilidade**:
   - pontuar/qualificar **fonte, documento, proveniência, consistência e vínculo**, nunca a pessoa;
   - preservar contradições e retificações;
   - registrar fonte primária, data, jurisdição e estado atual;
   - não produzir ranking político, reputacional ou eleitoral.

7. **Correlação futura**:
   - relacionar projetos, votos, cargos, contratos, despesas, sanções e processos somente por identificadores e vínculos documentais fortes;
   - correlação gera hipótese/linha de investigação, não conclusão adversa;
   - revisão humana permanece obrigatória.

Fontes candidatas prioritárias: Dados Abertos da Câmara, Dados Abertos do Senado, CNJ/DataJud, diários oficiais, TCU/TCEs/TCMs, CGU/CEAF/CEIS/CNEP e demais bases oficiais aplicáveis.

Pré-condições: contrato de fonte próprio, política de dados pessoais e proteção contra homônimos, estados epistêmicos específicos, testes sintéticos, revisão jurídica/privacidade e gate humano antes de qualquer publicação.


## Marco M8 — Interface humana do Observador

Funções:

- assistir investigações;
- adicionar fonte pública;
- comentar sem alterar evidência;
- contestar interpretação;
- confirmar apenas como contribuição humana;
- solicitar aprofundamento;
- realizar revisão explícita;
- acompanhar lacunas e divergências.

Não permitir: editar histórico, apagar contradições, transformar voto em evidência ou publicar sem gate.

## Marco M9 — Operação e endurecimento

Pendências:

- serviço persistente;
- SLOs e telemetria;
- alertas;
- rotação formal de segredos;
- retenção;
- WORM/Object Lock;
- auditoria externa;
- calibração de precisão/recall;
- plano de incidentes;
- implantação multiusuário segura.



## Marco M10 — Produto, governança, interface e acesso

Estado: **CONGELADO ATÉ O ARCA ESTAR FUNCIONAL DE PONTA A PONTA E HAVER DECISÃO HUMANA EXPLÍCITA DE DESCONGELAMENTO**.

Objetivo: somente após o núcleo investigativo estar funcional, transformar o ARCA em uma superfície pública/operacional madura, com governança, privacidade, segurança, interface e acesso definidos antes de qualquer abertura ampla a usuários.

Entregas futuras:

1. **Política de Privacidade**:
   - finalidade e base de tratamento por categoria de dado;
   - minimização;
   - retenção e descarte;
   - dados públicos versus material custodial/privado;
   - direitos e canais de contato;
   - transparência sobre automação e revisão humana.

2. **Política de Segurança**:
   - threat model;
   - gestão de credenciais e segredos;
   - segregação de funções;
   - logging/auditoria;
   - resposta a incidentes;
   - recuperação;
   - gestão de vulnerabilidades;
   - controles de abuso e acesso indevido.

3. **Termos de Uso**:
   - escopo e finalidade do ARCA;
   - usos permitidos e proibidos;
   - limites das análises;
   - distinção entre evidência pública, hipótese, estado epistêmico e conclusão oficial;
   - responsabilidades do operador/usuário;
   - regras para publicação, contestação e revisão.

4. **Interface humana / site / frontend**:
   - arquitetura de informação;
   - navegação por investigações, fontes, timeline, evidências, relações e estados;
   - visualização de proveniência e contraprovas;
   - layout responsivo/mobile-first;
   - acessibilidade;
   - design inspirado em princípios de clareza e organização visual do ecossistema gov.br, **sem imitar identidade oficial, brasões, marcas ou sugerir que o ARCA seja serviço governamental**;
   - design system próprio do ARCA em pt-BR.

5. **Painel do Criador**:
   - concluir o painel administrativo do Criador;
   - visão de saúde do sistema;
   - filas, agentes, workers, fontes e custos;
   - gates de aprovação;
   - gestão de incidentes;
   - estado dos checkpoints/Atlas;
   - configuração de políticas;
   - trilha de auditoria;
   - controles de publicação e emergência.

6. **Análise de necessidade de login**:
   - primeiro decidir se login é realmente necessário;
   - evitar autenticação se a função puder ser pública/read-only sem conta;
   - se login for necessário, definir papéis, menor privilégio, recuperação de conta, autenticação forte, sessões, auditoria e minimização de dados;
   - separar observador público, colaborador/revisor e Criador/administrador;
   - não criar banco de perfis/contas sem necessidade funcional comprovada.

7. **Gate pré-lançamento**:
   - revisão conjunta de privacidade, segurança, termos, frontend, acessibilidade, autenticação (se houver), Atlas e runbooks;
   - nenhum lançamento público amplo antes desse gate.

Regra de congelamento: nenhuma implementação desta frente deve competir com M5, M5-R, M6–M9 ou com a conclusão do núcleo. O descongelamento exige decisão humana explícita declarando o ARCA funcional de ponta a ponta.

## Regra de checkpoint por ciclo

Toda entrega material deve atualizar:

1. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`;
2. novo `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_YYYY-MM-DD_NNN.md`;
3. este roadmap;
4. matriz de estado quando a maturidade mudar;
5. checkpoint privado se topologia operacional mudar;
6. `docs/ARCA_ATLAS_TECNICO_VIVO_V0_1.md` e `docs/atlas/ARCA_ATLAS_COMPONENTES_V0_1.json` se houver impacto arquitetural ou operacional.

O checkpoint deve registrar SHA, PR, CI, testes, decisões, limites, próximo passo, comandos de retomada e condições de parada.
