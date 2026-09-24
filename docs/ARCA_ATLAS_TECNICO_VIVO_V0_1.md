# ARCA — Atlas Técnico Vivo V0.1

Estado: **ATIVO COMO MAPA CANÔNICO / EVOLUÇÃO CONTÍNUA**.

## Objetivo

O Atlas Técnico Vivo é o mapa interno do ARCA. Ele deve permitir que qualquer operador ou agente autorizado entenda:

- o que cada peça faz;
- onde está;
- quando atua;
- quem a chama;
- de quem depende;
- quais dados recebe e produz;
- quais permissões possui;
- como verificar se está saudável;
- como detectar falha;
- como recuperar/religar;
- quais fallbacks existem;
- quais riscos de reexecução existem;
- quais gates humanos ou de segurança impedem ações indevidas.

## Regra de atualização

Toda mudança arquitetural significativa deve atualizar o Atlas antes de ser considerada concluída.

Mudanças significativas incluem:

- novo componente;
- nova dependência;
- nova capability;
- mudança de autoridade;
- novo fluxo de dados;
- novo mecanismo de recuperação;
- novo fallback;
- mudança de armazenamento/custódia;
- mudança de autenticação;
- alteração de sequência M0–M9;
- ativação/desativação de worker/agent;
- mudança relevante no Vince ou Machine Bridge.

## Camadas

### Núcleo investigativo

- M0/M1: contratos de fonte, adapters e Evidence Envelopes;
- M2: correlação financeira;
- M3: correlação multifonte + dois agentes + verificação adversarial;
- M4: aquisição live controlada e custódia;
- M5-A: gate pré-correlação;
- M5-B: caminho pós-custódia até HUMAN_REVIEW;
- M5-R: dossiê público/encaminhamento, ainda futuro.

### Plano de execução

- Machine Bridge;
- Vince Pathfinder/Recovery;
- Termux workers;
- malha executora;
- endpoints/agentes externos futuros.

### Plano de evidência

- custódia privada;
- proveniência;
- hashes;
- contraprovas;
- states epistêmicos.

### Plano de controle

- manifests;
- budgets;
- policies;
- gates humanos;
- publicação sanitizada.

### Recuperação

- checkpoints;
- replay protection;
- failover reconciliado;
- durable challenge registry;
- runbooks.

## Registro por componente

Cada componente deve ter, no mínimo:

- `id`;
- `nome`;
- `finalidade`;
- `estado`;
- `localizacao`;
- `dependeDe`;
- `chamadoPor`;
- `entradas`;
- `saidas`;
- `capabilities`;
- `limites`;
- `healthCheck`;
- `modosDeFalha`;
- `recuperacao`;
- `fallback`;
- `riscoDeReexecucao`;
- `runbook`;
- `seguranca`.

## Fonte legível por máquina

O inventário inicial fica em:

`docs/atlas/ARCA_ATLAS_COMPONENTES_V0_1.json`

Esse arquivo não substitui documentação humana; ele fornece estrutura para futuras ferramentas, Vince, validação e visualização.

## Regra para Vince

Vince poderá futuramente consultar o Atlas para:

- descobrir dependências;
- avaliar impacto de falha;
- localizar runbook;
- identificar fallback;
- decidir se uma ação é permitida;
- saber se deve parar e pedir revisão humana.

Consultar o Atlas não concede autoridade nova ao Vince.


## Frentes futuras congeladas

### Produto, governança e interface

O marco M10 permanece congelado até o ARCA estar funcional de ponta a ponta e haver decisão humana explícita. Inclui políticas de privacidade/segurança, termos de uso, frontend/site, design system próprio, conclusão do Painel do Criador e análise sobre necessidade de login.

### Inteligência cívica documental

O módulo M7-CIV é planejado para consolidar atividade legislativa e histórico público institucional/judicial/administrativo de agentes públicos. O Atlas deverá, quando implementado, mapear adaptadores por fonte, proteção contra homônimos, estados processuais e vínculo de proveniência.

Regra: o ARCA poderá avaliar confiabilidade de fonte/evidência, não reputação ou “confiabilidade” de pessoa.


### M5-C — observação estrutural do schema Portal

Componente: `m5-c-observador-schema-portal`.

Função: receber bytes Portal já custodiais e verificados, extrair somente estrutura/tipos sem valores e vincular a observação aos hashes de custódia. Não normaliza, não publica e não admite parser automaticamente.

Recuperação: se houver drift ou estrutura incompatível, preservar a observação, manter a normalização bloqueada e exigir revisão humana. Não repetir GET apenas para “tentar outro schema”.


### M5-D — prontidão da credencial Portal

Componente: `m5-d-prontidao-credencial-portal`.

Função: separar token presente/formato/proveniência de atividade real. Produz fingerprint sanitizado e mantém `ACTIVE_UNKNOWN` até observação da própria API.

Observação live atual: após a ativação confirmada pela CGU, o Gate 045 comprovou a chave em `/situacao-imovel` e o Gate 046 comprovou o endpoint financeiro. O run `35917902630` retornou HTTP 200 em `/api-de-dados/despesas/documentos-relacionados`, com `ACCEPTED_ON_OBSERVED_REQUEST`, `activeVerified=true`, 1 registro, 440 bytes, `retries=0` e custódia privada. O fingerprint canônico permanece `37c90b46b7e1a4fcf699aee3f94979829cb044d13979cfbf05a229cd869a8092`.

Recuperação: em falhas futuras, preservar status/fingerprint e exigir nova autorização antes de qualquer tentativa. O endpoint financeiro respondeu 2xx nesta observação, mas isso não autoriza retries nem garante disponibilidade permanente.


### Gate 040 — preflight Portal isolado

Componente: `portal-isolated-preflight`.

Função: validar fingerprint/proveniência da credencial, scope e cofre privado sem possuir capability de request ao endpoint do Portal.

Prova operacional histórica: run `35884318441` concluiu o primeiro preflight real. O run `35885734963` foi consumido pelo quarto GET histórico. A variante target-bound Gate 040-SI foi provada no run `35910828041`, revisão `9ccf812bad58b1674a48973fb15869a11cb53467`, target `PORTAL_SITUACAO_IMOVEL`, zero rede; seu binding foi consumido pelo único GET do run `35910916588`. Qualquer próximo request exige novo Gate.

Recuperação: qualquer falha ou drift mantém rede Portal não autorizada. Corrigir metadado, secret ou cofre e repetir somente o preflight. O quarto GET continua em gate humano separado.


### ARCA Device Agent / Runtime Autônomo Local

Estado: **planejado/congelado**.

Função futura: expor capabilities locais explícitas do dispositivo ao plano de controle do ARCA, com três níveis separados de autoridade: ARCA-only, Termux e Device.

A variante Runtime Autônomo Local poderá executar modelo, memória, scheduler e ferramentas em infraestrutura controlada pelo operador. Isso cria independência operacional da nuvem, mas não constitui transferência da instância/modelo hospedado pelo ChatGPT para o dispositivo.

Princípios: deny-by-default, capability catalog, identidade criptográfica, replay protection, revogação, kill switch, watchdog, budgets de recurso e auditoria.

Decisão: **Device Agent é o caminho preferencial para o operador atual**. Runtime Autônomo Local permanece congelado até solicitação explícita do usuário.

Documento canônico: `docs/ARCA_DEVICE_AGENT_RUNTIME_LOCAL_V0_1.md`.


### ARCA AI Gateway / OpenAI-compatible

Estado: **planejado/congelado até solicitação explícita do usuário**.

Função futura: oferecer uma interface única para modelos remotos ou locais, começando potencialmente pela OpenAI API sem servidor próprio. Deve manter capability discovery, trust separado, budget/custo e fallback por provider.

Documento canônico: `docs/ARCA_AI_GATEWAY_OPENAI_COMPATIBLE_V0_1.md`.


### M5-E — binding do preflight ao probe live

Estado canônico da M5-E: **integrado/testado offline com binding exercitado em preflight operacional real**. O Gate 040 está **implementado/testado e com prova operacional concluída pelos secrets reais**, sem GET Portal.

Componente: `m5-e-preflight-binding`.

Função: vincular o live probe ao estado sanitizado e revisado do Gate 040. Mudança de revisão, documento, credencial ou cofre invalida o digest antes da criação do transporte Portal.

Recuperação: gerar novo preflight, revisar novos hashes e exigir nova autorização humana; nunca adaptar/reutilizar autorização automaticamente.


### Gate 042 — diagnóstico offline do quarto 401

Componente operacional/documental: `m5-gate-042-portal-401-diagnostico`.

Função: consolidar a prova 401 custodial, revalidar contrato HTTP e credencial sem rede, preparar suporte técnico e impedir retry cego.

Estado: **RESOLVIDO QUANTO À ATIVAÇÃO DA CHAVE / HISTÓRICO PRESERVADO NA ISSUE #176**.

Evidência canônica: run `35886041113`, HTTP 401, `AUTHORIZATION_NOT_ESTABLISHED`, `credentialInvalidProven=false`, 1 request, `retries=0`, `CAPTURED_AND_SEALED`, `STORED_PRIVATE`.

Resultado: a CGU confirmou chave anteriormente inativa, ativou-a e informou intermitência em `documentos-relacionados`. O teste diferencial autorizado em `/situacao-imovel` retornou HTTP 200. A autenticação geral está comprovada; `documentos-relacionados` continua não comprovado após ativação. Nenhuma autorização antiga é reutilizável.


### Transferegov — Transferências Especiais S1

Componente: `transferegov-transferencias-especiais-offline`.

Função: introduzir no núcleo multifonte uma fonte pública independente para contexto de transferências especiais, emendas, pagamentos e execução, inicialmente apenas por fixture sintética.

Estado: **INTEGRADO À `main` / PR #179 / OFFLINE FIXTURE / ZERO REDE**.

Origem canônica: `https://api-publica.transferegov.gestao.gov.br/`.

Registro operacional: `config/public-source-registry-s1.json`. O `public-source-registry-v1.json` permanece congelado para reprodutibilidade das provas históricas.

Capacidades atuais: normalização sintética determinística, Evidence Envelope hash-only, lacunas explícitas e integração ao Gate Offline Multifonte.

Limites: sem `PUBLIC_GET`, sem schema live aceito, sem correlação automática com PNCP/Portal, sem inferência adversa sobre parlamentar/ente e sem conclusão sobre entrega física ou regularidade.

Recuperação: qualquer divergência de origem/campo/UF/valor falha fechado. Acesso live futuro exige componente de transporte separado, fake fetch, budgets, custódia, preflight e autorização humana específica.


### TCU — Acórdãos Offline S2

Componente: `tcu-acordaos-offline-s2`.

Função: incorporar decisões de controle externo do TCU como fonte documental nacional, inicialmente por fixture sintética e sem rede.

Estado: **INTEGRADO À `main` / PR #180 / S2 / OFFLINE FIXTURE / ZERO REDE**.

Origem canônica: `https://dados-abertos.apps.tcu.gov.br/api/acordao/recupera-acordaos`.

Registro operacional: `config/public-source-registry-s2.json`; V1 e S1 permanecem congelados para reprodutibilidade.

Arquitetura: Evidence Envelope aceita `BR/NATIONAL` além de `BR/UF/XX`, sem mudar a serialização dos registros antigos.

Limites: acórdão exige leitura contextual; recurso, revisão ou decisão posterior podem mudar seu significado; sem inferência adversa automática, sem `PUBLIC_GET`, sem publicação.

Recuperação: URL externa ao domínio TCU, data inválida, campo inesperado, snapshot incorreto ou fonte não executável falham fechado.


### Gate 045 — autenticação Portal comprovada

Componente: `m5-gate-045-portal-auth-validation-2xx`.

Função: validar a atividade real da chave Portal em um endpoint simples recomendado pela CGU, sem misturar a validação de autenticação com o endpoint financeiro intermitente.

Estado: **CONCLUÍDO / HTTP 200 / AUTORIZAÇÃO CONSUMIDA**.

Preflight: run `35910828041`, revisão `9ccf812bad58b1674a48973fb15869a11cb53467`, target-bound, zero rede, cofre privado pronto.

Live: run `35910916588`, mesma revisão, exatamente 1 GET a `/api-de-dados/situacao-imovel`, HTTP 200, `ACCEPTED_ON_OBSERVED_REQUEST`, `activeVerified=true`, 5 strings validadas, 66 bytes, `retries=0`, `STORED_PRIVATE`.

Custódia: envelope `ef6bcd5e0c75ba8fa9638780bbf8fbbe5a3402ce3b0a68ab251e3338daf662b8`; receipt `5168cb72997d3f8aa504b0aff5939b1215235ebab50ca72c6ec462e2c2f59854`.

Limite: o resultado prova que a chave atual foi aceita nessa requisição. Não prova a disponibilidade de `/despesas/documentos-relacionados`, nem autoriza repetir qualquer endpoint.

Recuperação: qualquer novo GET requer novo escopo, Gate atual e autorização humana explícita. O run `35910916588` não deve ser rerodado.


### Gate 046 — primeiro 2xx financeiro Portal

Componente: `m5-gate-046-portal-related-documents-2xx`.

Função: obter e custodiar o primeiro retorno 2xx de `/api-de-dados/despesas/documentos-relacionados` sob binding exato, orçamento de uma única requisição e zero retries.

Estado: **CONCLUÍDO / HTTP 200 / 1 REGISTRO / SCHEMA OBSERVADO / AUTORIZAÇÃO CONSUMIDA**.

Preflight: run `35916999807`, revisão `44b2dd9b5bc25c216d9b599fb552ea0fbb063c5f`, `scopeHash=38637de67d7f7eb5a5fc57fa327069c20857bd7ae7ed62b8072312a2fad37eb1`, `preflightSha256=1e07709d9fbdbcc079fb2e6f244784714ddf075b09bf5502b151afacb639f99f`, zero rede.

Live: run `35917902630`, mesma revisão, exatamente 1 GET, HTTP 200, 1 registro, 440 bytes, `VALIDATED`, `ACCEPTED_ON_OBSERVED_REQUEST`, `retries=0`, `STORED_PRIVATE`.

Estrutura observada: array de 1 objeto com `data`, `documento`, `documentoResumido`, `elementoDespesa`, `especie`, `fase`, `favorecido`, `orgaoSuperior`, `orgaoVinculado`, `unidadeGestora` e `valor`, todos strings na observação atual. `valuesIncluded=false`, `rawBytesIncluded=false`, `normalizationPerformed=false`, `parserAdmitted=false`.

Custódia: envelope `d398da542596a7ad387f0d1c5bbe2b9e201e00e1f812507a7e2c97b16d421db5`; receipt `1ed2cadf58f1a3213271387400e3015089c24c690b7e1c948eb63d056c564cbc`; schema hash `79f6c837641baf1d6b09c545fe3df836c068ce8a29ff641b6723c477bcd666f6`.

Próximo passo: parser/normalizador offline baseado na estrutura observada, com fixture sintética e testes de drift. Nenhum novo GET é necessário.

Recuperação: não rerodar o run `35917902630`; qualquer futura aquisição exige novo Gate e autorização humana.


### M5-F — parser financeiro Portal offline

Componente: `m5-f-portal-related-documents-parser-offline`.

Função: transformar a estrutura sanitizada observada no Gate 046 em um parser determinístico, testável e fail-closed, sem rede e sem abrir bytes live.

Estado: **IMPLEMENTADO EM BRANCH / FIXTURE SINTÉTICA / LIVE NORMALIZATION BLOQUEADA**.

Âncora: `observedSchemaSha256=79f6c837641baf1d6b09c545fe3df836c068ce8a29ff641b6723c477bcd666f6`.

Entrada permitida atual: somente `SYNTHETIC_FIXTURE`.

Saída: registros sintéticos normalizados, refs SHA-256 para documento/beneficiário/órgãos, `normalizationSha256`, `identityInferencesMade=false`, `publicationAuthorized=false`.

Limites: exatamente os 11 campos observados; campo ausente/adicional, formato de data/valor incompatível, fase desconhecida ou schema hash divergente falham fechado. `CUSTODIAL_LIVE` é explicitamente recusado.

Recuperação: corrigir apenas fixture/contrato ou abrir gate M5-G separado para admissão da normalização custodial. Não executar novo GET por causa de falha do parser.

Runbook: `docs/ARCA_M5_PORTAL_RELATED_DOCUMENTS_PARSER_V0_1.md`.


### M5-G — admissão da normalização custodial

Componente: `m5-g-portal-parser-admission`.

Função: separar parser implementado/testado da autorização para aplicá-lo aos bytes reais já custodiais do Gate 046.

Estado: **IMPLEMENTADO EM BRANCH / SEM REDE / SEM ABRIR CUSTÓDIA / DECISÃO HUMANA PENDENTE**.

Binding: revisão + parser contract hash + schema Gate 046 + envelope + receipt + response hash + scope.

Saída inicial: candidato `AWAITING_HUMAN_ADMISSION` com `candidateSha256`, sem bytes ou valores.

Decisões humanas possíveis: `ADMIT_FOR_CUSTODIAL_NORMALIZATION`, `REJECT_PARSER`, `HOLD_FOR_MORE_EVIDENCE`.

Limite: mesmo uma admissão mantém `networkAuthorized=false`, `publicationAuthorized=false` e `correlationAuthorized=false`. Apenas a normalização custodial offline poderá ser liberada.

Recuperação: hash divergente, revisão diferente ou binding incompatível falham fechado. Não abrir custódia nem adaptar parser automaticamente.

Runbook: `docs/ARCA_M5_PORTAL_PARSER_ADMISSION_V0_1.md`.


### M5-H — normalização custodial offline

Componente: `m5-h-portal-custodial-normalization-offline`.

Função: aplicar o parser M5-F aos bytes reais já custodiais somente depois de uma decisão M5-G hash-bound, sem rede de fonte, sem novo GET, sem publicação e sem correlação.

Estado: **EXECUTADO COM SUCESSO / NORMALIZAÇÃO LIVE CUSTODIAL CONCLUÍDA / SEM NOVO GET / SEM CORRELAÇÃO**.

Candidato admitido: `0bcf1806c2480b2f82f8efff43e67436460043375d302fb6fcf44c80ec3e97f9`.

Decisão: `ADMIT_FOR_CUSTODIAL_NORMALIZATION`.

Executor: `src/investigation/m5-portal-custodial-normalization.mjs`.

CLI: `scripts/normalize-m5-portal-custody-local.mjs`.

O executor exige envelope e passphrase já locais. Não possui download, fetch, HTTP, transporte Portal ou transporte GitHub.

Antes de normalizar, revalida candidato, decisão, parser contract, schema, envelope, receipt, response hash e scope. Depois reabre a custódia, reexecuta o observador M5-C e aplica o parser somente se o schema continuar idêntico.

A saída real será imediatamente resselada em um novo envelope privado. A prova sanitizada não contém valores, nomes ou bytes brutos.

Execução real: run `35931108034`, revisão `bcb0c7064df3294bf31520053de8ab893a71e2fa`. O envelope criptografado já existente foi transportado do GitHub, aberto com Secret, revalidado, normalizado, resselado e persistido no cofre privado. `normalizationSha256=f7306be0478fb603a5fe70957eeb15bf337b7b4db51f6eacbaf699c89f7bcfa7`; novo envelope `6cb8513dab0505611e7f376398ca9c2e334131c58265b818fe1b73e8bc72cbcb`; plaintext não publicado.

Recuperação: qualquer divergência futura deve parar no binding/prova; não rerodar aquisição Portal por causa de falha downstream.

Runbook: `docs/ARCA_M5_CUSTODIAL_NORMALIZATION_OFFLINE_V0_1.md`.


### M5-I — binding live normalizado Portal

Componente: `m5-i-portal-live-normalized-binding`.

Função: transformar a prova M5-H em uma fonte Portal live normalizada compatível com a Fase B, preservando separadamente a custódia original e a custódia derivada.

Estado: **IMPLEMENTADO EM BRANCH / NORMALIZAÇÃO LIVE COMPROVADA / CORRELAÇÃO BLOQUEADA**.

Captura original: run `35917902630`, envelope `d398da542596a7ad387f0d1c5bbe2b9e201e00e1f812507a7e2c97b16d421db5`, receipt `1ed2cadf58f1a3213271387400e3015089c24c690b7e1c948eb63d056c564cbc`.

Normalização: run `35931108034`, `normalizationSha256=f7306be0478fb603a5fe70957eeb15bf337b7b4db51f6eacbaf699c89f7bcfa7`, envelope derivado `6cb8513dab0505611e7f376398ca9c2e334131c58265b818fe1b73e8bc72cbcb`, store receipt `39671a927032514d89e474cb81f61215745db88b858f3d43115daf265ee794a6`.

Saídas: `custodyInput`, `sourceBinding` e `derivedNormalization`, todos sem valores brutos.

Limites: `correlationAuthorized=false`, `publicationAuthorized=false`, nenhum novo GET, nenhum classificador.

Recuperação: binding adulterado ou cadeia incompleta falha fechado. Não colapsar captura original e derivação normalizada no mesmo envelope.

Runbook: `docs/ARCA_M5_PORTAL_LIVE_NORMALIZED_BINDING_V0_1.md`.


### M5-J — observação e parser PNCP live

Componente: `m5-j-pncp-live-parser`.

Função: observar a custódia PNCP live já existente e construir parser real baseado na estrutura observada, sem novo GET.

Estado: **OBSERVAÇÃO CONCLUÍDA / PARSER V1 EM BRANCH / NORMALIZAÇÃO LIVE AINDA BLOQUEADA**.

Custódia: run `35547609136`, envelope `c707689e04d7bd091a59555d883a2d2a4d716b442b485d8b3b55efa1c65c6202`, receipt `ad1fd3f1c3e09637f48f8e387f47f518392246cb30338704e914bac99028e19b`.

Observação: run `35932200063`, 3 arquivos / 6289 bytes, `observedStructureSha256=4a00de8f61190819cc6e172f45438dcb22dc1c952430fc7a1c79f2cc0dcfabb9`.

A página de descoberta possui 2 contratações, com órgão/CNPJ, unidade, UF/IBGE, modalidade, processo, objeto, situação e valor estimado. O schema não apresenta fornecedor/adjudicatário.

O parser V1 exige estrutura exata, valida o vínculo número de controle↔CNPJ↔ano↔sequencial e emite `supplierIdentifier=null`, `supplierObserved=false`.

Limites: fixture sintética apenas; normalização live ainda bloqueada; sem correlação/publicação; ausência de fornecedor é lacuna de cobertura, não indício.

Runbook: `docs/ARCA_M5_PNCP_LIVE_PARSER_V0_1.md`.


### M5-J — binding PNCP live normalizado

Componente: `m5-j-pncp-live-normalized-binding`.

Função: preservar a captura PNCP original como âncora, a normalização privada como derivação e emitir entradas compatíveis com a Fase B sem executar correlação.

Estado: **NORMALIZAÇÃO REAL CONCLUÍDA / PERSISTIDA PRIVADAMENTE / BINDING IMPLEMENTADO / CORRELAÇÃO BLOQUEADA**.

Normalização canônica: run `36026221085`, 2 registros, `normalizationSha256=c91e5bce7240fa6ca127aeeb33f7a7763a891bd84c65ee1a29950e66a32b7a2d`, envelope normalizado `95eaf8fa048860dc2e41edcb1de043405d5e7a0a60d4183420b0fb4bf3791f33`, receipt privado `00d024c3b7e9dfc657b2dc8705e93d2a6d2ddadde4dd55718b2c4b46833b9447`.

Cobertura: `supplierObserved=false`, `supplierIdentifierAvailable=false`, `supplierMayBeInferred=false`.

Saída: `custodyInput`, `sourceBinding`, `derivedNormalization` e `coverage`, todos hash-bound.

Limites: `correlationAuthorized=false`, `publicationAuthorized=false`; ausência de fornecedor não é evidência adversa e bloqueia qualquer ponte forte baseada em fornecedor.

Recuperação: drift de hash, record count, cobertura ou binding falha fechado. Não repetir GET para preencher lacuna; somente fonte pública adicional ou novo escopo explicitamente autorizado pode ampliar cobertura.

Runbook: `docs/ARCA_M5_PNCP_LIVE_NORMALIZED_BINDING_V0_1.md`.


### M5-K — prontidão de correlação

Componente: `m5-k-correlation-readiness`.

Função: avaliar apenas pelos bindings sanitizados M5-I/M5-J se existem pontes documentais suficientes para correlação forte.

Estado: **IMPLEMENTADO EM BRANCH / OFFLINE / SEM ABRIR VALORES PRIVADOS / SEM CORRELAÇÃO**.

Resultado: `LIMITED_CANDIDATE_SCREENING_ONLY`.

Pontes fortes indisponíveis: fornecedor por cobertura PNCP, identificador forte compartilhado de órgão e referência cross-source direta.

Dimensões candidatas: referência documental e texto de órgão/unidade.

Dimensões fracas: data e valor.

Limites: `readyForStrongCorrelation=false`, `supplierInferenceAllowed=false`, `correlationAttempted=false`, `correlationAuthorized=false`, `publicationAttempted=false`.

Recuperação: ausência de ponte forte não autoriza inferência nem novo GET automático. O próximo passo permitido é triagem privada de candidatos, com saída máxima `CANDIDATE`.

Runbook: `docs/ARCA_M5_CORRELATION_READINESS_V0_1.md`.


### M5-L — triagem privada de candidatos

Componente: `m5-l-private-candidate-screening`.

Função: comparar privadamente as normalizações Portal/PNCP já custodiais e emitir somente candidatos hash-only.

Estado: **INTEGRADO E EXECUTADO / RUN 36028937585 / NO_CANDIDATE_BRIDGE_OBSERVED**.

Transporte: somente envelopes criptografados allowlisted do cofre privado, com verificação do hash esperado antes da abertura.

Resultado live privado: 2 pares avaliados, 0 candidatos, 2 `NOT_OBSERVED`, 0 confirmados. Nos dois pares, referência documental exata, texto de órgão/unidade, mesma data, janela de 30 dias e valor exato foram falsos.

`screeningSha256=06440986b4e2a360e13add77709ab6b2bc1b9d66847cb71173618f9c32881e95`.

Limites: fornecedor não comparado/inferido, `confirmedCount=0`, `correlationAttempted=false`, zero novo GET, zero publicação de valores. O resultado prova ausência de ponte nas capturas atuais, não ausência de relação no mundo real.

Recuperação: não repetir a mesma triagem para “forçar” candidato. Ampliar cobertura apenas por fonte pública oficial adicional/gate separado, mantendo as capturas atuais como contraprova de não observação.

Runbook: `docs/ARCA_M5_PRIVATE_CANDIDATE_SCREENING_V0_1.md` e checkpoint 054.


### M5-M — cobertura PNCP por contratos/empenhos

Componente: `m5-m-pncp-contract-coverage`.

Função: ampliar a cobertura documental depois do M5-L sem candidato, consultando a superfície oficial PNCP de contratos/empenhos vinculados diretamente às contratações já normalizadas.

Estado: **SEGUNDO LIVE CONCLUÍDO / `pagina=1` / 404+404 CUSTODIADOS / DIAGNÓSTICO OFFLINE UNCLASSIFIED / SEM NOVO GET**.

Endpoint allowlisted:

`GET https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/contratos/contratacao/{ano}/{sequencial}`

Capacidade esperada: observar `niFornecedor`, `nomeRazaoSocialFornecedor`, `numeroControlePNCPCompra`, `numeroContratoEmpenho`, `processo`, órgão e valores, sem inferir relações antes da custódia.

Orçamento: exatamente os 2 alvos atuais, no máximo 2 requests, zero retries, timeout 30 s e 64 KiB por resposta.

Preflight: abre somente a normalização PNCP privada já custodial e publica apenas hashes dos alvos + `candidateSha256`.

Live: o candidato `aa995fd2...c99ec` foi executado no run `36036733351`: exatamente 2 requests, zero retry, ambos HTTP 400. As respostas foram seladas e persistidas no cofre privado antes de qualquer análise.

Limites: a autorização dos 2 GETs foi consumida; nenhum novo GET está autorizado. Sem publicação, sem correlação, sem inferência de fornecedor e sem conclusão adversa.

Recuperação: o live corrigido `36039677768` consumiu exatamente 2 GETs e retornou 404/404; o diagnóstico offline `36040450553` classificou ambos como `UNCLASSIFIED`. Não repetir o mesmo endpoint nem inferir ausência de contrato. Próximo caminho: nova superfície oficial de itens/resultados de item, sempre sob novo preflight/candidato/autorização.

Runtime observado:

- mensagem dos dois 400 com mesmo SHA-256 `c1d6bb85779fbebfd285b2e31d103f4c4b97ccf8128403e5a1db6092833f6fc2`;
- hash corresponde exatamente à exigência genérica de `pagina` como request parameter obrigatório Integer;
- Manual PNCP v2.6 seção 13.10 não lista esse query parameter;
- estado: `DOCUMENTATION_RUNTIME_DRIFT_OBSERVED`;
- correção mínima: `query={pagina:1}`;
- `tamanhoPagina` não é inferido.

Runbook: `docs/ARCA_M5_PNCP_CONTRACT_COVERAGE_V0_1.md`.


#### Atualização M5-M — segundo live e limite probatório

Run live corrigido: `36039677768`.

- `pagina=1`;
- 2 GETs exatos;
- zero retries;
- HTTP 404 + HTTP 404;
- envelope privado `568f3eb1...14eb`;
- nenhuma publicação;
- nenhuma correlação.

Diagnóstico offline: `36040450553`.

- zero source requests;
- mesmo shape e mesmo hash de mensagem;
- mensagem relacionada a contrato;
- nenhum marcador seguro de rota/recurso estático;
- nenhum marcador seguro de parâmetro;
- nenhum marcador de autenticação/forbidden;
- classificação final `UNCLASSIFIED`.

Limite: 404 não é convertido em `NO_LINKED_CONTRACT_OR_COMMITMENT_OBSERVED` sem evidência semântica suficiente.



### M5-N1 — descoberta PNCP de itens

Componente: `m5-n1-pncp-item-discovery`.

Função: descobrir os itens das duas contratações PNCP já normalizadas sem repetir o endpoint M5-M e sem consultar resultados ainda.

Estado: **POLÍTICA GET INTEGRADA / PRIMEIRO LIVE PAGE10 EXECUTADO / SHAPE INESPERADO / CUSTÓDIA DURÁVEL NÃO PERSISTIDA / CORREÇÃO CUSTODY-BEFORE-OBSERVATION EM BRANCH**.

Endpoint allowlisted:

`GET https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens?pagina=1&tamanhoPagina=10`

Capacidade observável futura:

- `numeroItem`;
- `temResultado`;
- contagem de itens;
- contagem de itens com resultado;
- detecção de página possivelmente truncada.

Orçamento:

- exatamente 2 alvos atuais;
- `maxRequests=2`;
- `retries=0`;
- timeout 30 s;
- 512 KiB por resposta;
- 10 itens por página.

Privacidade: CNPJ/ano/sequencial permanecem privados; candidato/preflight publica apenas hashes dos alvos.

Regra de completude: se `itemCount=10`, marcar `pagePossiblyTruncated=true` e bloquear M5-N2 até paginação adicional.

M5-N2 só poderá ser derivado de itens com `temResultado=true`, e sua quantidade de requests dependerá da captura M5-N1 real.

Política de GET: PNCP consulta pública é `NO_MONETARY_CHARGE_OBSERVED`; `humanAuthorizationRequired=false`; `autoExecutionAllowed=true`. Sem fornecedor, publicação, correlação ou conclusão adversa.

Runbook: `docs/ARCA_M5_N1_PNCP_ITEM_DISCOVERY_V0_1.md`.


#### Atualização M5-N1 — preflight canônico

Run: `36044350610`.

- `planSha256=75b7910e40b1873a5f694c13eda1c4e00ae1b10ad52e8ebb4c36ef968b29b0b7`;
- `candidateSha256=13816eb8bd0582c0046018fffd652ddc425a2258cc0802453767dcf4f0bdd844`;
- 2 target hashes;
- `pagina=1`;
- `tamanhoPagina=50`;
- source network desligada;
- publicação/correlação desligadas;
- nenhum GET live executado.



### Política de autorização de GET por custo monetário

Componente: `source-get-cost-policy`.

Regra vigente:

- `NO_MONETARY_CHARGE_OBSERVED` → execução automática permitida dentro do gate técnico;
- `MONETARY_COST` → autorização humana obrigatória antes do gasto;
- `UNKNOWN` → execução bloqueada até classificação de custo, sem pedir autorização prematura.

A política não concede autoridade para métodos mutáveis, publicação ou correlação.

Runbook: `docs/ARCA_GET_COST_AUTHORIZATION_POLICY_V0_1.md`.



#### Atualização M5-N1 — falha de shape e correção de ordem de custódia

Preflight page10: `36050289566`.

Live automático: `36050412298`.

- 2 GETs executados;
- zero retries;
- falha posterior: `ARCA_M5_N1_RESPONSE_SHAPE_INVALID`;
- candidato: `8fbe4dc91e2ac31a3130627a9fb1d3a60cbb4eb41c60f46af61a278a23517c7b`;
- pelo menos a primeira resposta observada foi HTTP 200/JSON, pois o erro de shape só é emitido nesse ramo;
- shape real não deve ser inferido sem nova captura.

Falha arquitetural: o executor selava localmente, mas fazia a observação antes do persist durável. O cleanup eliminou a captura quando o parse falhou.

Correção: `GETs → seal → durable persist → structural observation`.

Se o shape divergir novamente, o ARCA preserva a captura e publica apenas `SCHEMA_UNEXPECTED` + diagnóstico estrutural sanitizado.

