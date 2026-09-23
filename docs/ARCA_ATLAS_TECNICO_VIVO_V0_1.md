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

Observação live atual: após a CGU confirmar que a chave estava inativada e ativá-la, o run `35910916588` retornou HTTP 200 em `/api-de-dados/situacao-imovel`. Estado: `ACCEPTED_ON_OBSERVED_REQUEST`, `activeVerified=true`, `credentialInvalidProven=false`, exatamente 1 request, `retries=0` e custódia privada. O fingerprint canônico continua `37c90b46b7e1a4fcf699aee3f94979829cb044d13979cfbf05a229cd869a8092`. O 401 histórico do run `35886041113` permanece preservado como evidência anterior à ativação.

Recuperação: em falhas futuras, preservar status e fingerprint e exigir nova autorização antes de qualquer tentativa. A atividade atual da chave está comprovada apenas no request 2xx observado; não inferir a saúde de outros endpoints a partir dele.


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
