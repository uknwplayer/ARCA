# ARCA — Roadmap detalhado atual

Atualizado em: **2026-09-22**

Base canônica após M2: `0.4.0-rc.1` / `bb006433f21a622aea4aaf618b728a19e4c327f5`

Regra: este arquivo descreve a sequência vigente. Não substituir gates por ativação direta.

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

## Marco M4 — Live controlado de uma fonte por vez

Estado: **M4a integrado em `main`; M4b concluído na PR #88 e verificado pela CI canônica Node 22.18; merge e GET real pendentes; nenhum GET real autorizado ou executado**. M4a: [PR #84](https://github.com/uknwplayer/ARCA/pull/84), commit [`d36df26`](https://github.com/uknwplayer/ARCA/commit/d36df26a45d736f1fdc605721426b3a8b228d4ba), CI da PR [35745211122](https://github.com/uknwplayer/ARCA/actions/runs/35745211122) e pós-merge [35745354987](https://github.com/uknwplayer/ARCA/actions/runs/35745354987), ambos verdes. PR #88 @ `8fff8e7f9b8ec46ee5eef7a959006e78d57644ab`; CI canônica run `35795775111` verde. Ver [checkpoint 013](checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_013.md), `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md` e checkpoint 011.

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

Entrega M4b no branch: contrato oficial registrado, transporte e captura limitados, custódia privada durável, testes sintéticos e workflow manual não executado. `npm test` local em Node 24 reproduz `UND_ERR_SOCKET` no teste Passkey (915/916); os demais gates locais, incluindo `check:public`, passaram. A CI canônica Node 22.18 passou integralmente no run `35795775111`. O manifesto hash-only não concede rede. O primeiro GET live continua condicionado a revisão final, parâmetros concretos e autorização explícita separada. A prova PNCP durável 002 não demonstra consulta live Portal. Para dados estaduais/municipais, criar conectores próprios; a API do Portal cobre execução federal.

Parada imediata: escopo divergente, custódia inválida, segredo ausente, resposta excessiva, ambiguidade de reexecução ou tentativa de publicação.

## Marco M5 — Live correlacionado limitado

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

M5-R não altera o caminho crítico atual. O gate imediato é integrar M4b e verificar o pós-merge; M5-R somente começa após o aceite de M5.

## Linha paralela V/E — Vince Pathfinder + ARCA Edge Steward

Estado: **REGISTRADA NO ROADMAP; IMPLEMENTAÇÃO FORA DO CAMINHO CRÍTICO ATUAL**.

Objetivo conjunto: ampliar a capacidade do ARCA de descobrir ambientes/agentes autorizados, estabelecer rotas verificáveis de execução e retorno, recuperar continuidade após falhas e manter uma presença operacional leve e recuperável, sem transformar descoberta em autoridade.

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

- V0: especificação, threat model e contratos de envelope/retorno;
- V1: descoberta + capability routing sem execução;
- V2: probe/ACK/resultado por rota allowlisted;
- V3: checkpoint, recuperação e failover reconciliado;
- V4: prova entre ambientes independentes com evidência de ida, execução e retorno.
- V5: integrar disponibilidade observada de Execution Endpoints, incluindo ChatGPT Work quando houver event-trigger canônico comprovado; ausência de ACK deve produzir estado `UNREACHABLE/INCONCLUSIVE`, nunca suposição de disponibilidade ou não execução.

Dependência Work atual: o plano de execução canônico existe, mas a ligação nativa do evento GitHub do ChatGPT Work ao repositório `uknwplayer/ARCA` ainda não foi provada. Ver PR #90 (probe de liveness) e PR #91 (migração do gatilho). Vince deverá tratar Work como endpoint candidato até existir ACK canônico recente.

Limites: sem varredura arbitrária, abuso de credenciais, shell genérico, expansão automática de rede/autoridade, merge, `main.write`, `trust.modify`, publicação investigativa ou acesso a fontes protegidas por inferência.

### ARCA Edge Steward

O Edge Steward permanece preservado no draft PR #78 e **continua congelado** conforme decisão vigente. Seu papel futuro é fornecer presença recuperável 24/7 no Android/Termux e compute oportunista limitado, outbound-only e preemptável quando o usuário retoma o aparelho.

Relação com Vince:

- Vince descobre, seleciona, encaminha e recupera rotas;
- Edge Steward mantém presença local leve, observa estado, reconcilia e pode executar apenas capabilities locais allowlisted;
- nenhum deles recebe autoridade automática de merge, escrita canônica, trust ou shell arbitrário;
- o Steward pode futuramente hospedar uma instância limitada do Vince, mas isso exige contrato próprio e não é pressuposto deste roadmap.

Gate de reativação do Edge Steward: somente depois de o núcleo investigativo provar operação live real e cadeia M5 aceita, salvo decisão explícita posterior do Criador. Até lá, documentação e arquitetura podem ser preservadas, mas implementação móvel não compete com M4/M5.

Aceite futuro da linha V/E: provas separadas de descoberta, ida/retorno, recuperação sem duplicação e presença móvel limitada; todas com identidade, hashes, checkpoints, evidência e revisão humana onde aplicável.

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

## Regra de checkpoint por ciclo

Toda entrega material deve atualizar:

1. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`;
2. novo `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_YYYY-MM-DD_NNN.md`;
3. este roadmap;
4. matriz de estado quando a maturidade mudar;
5. checkpoint privado se topologia operacional mudar.

O checkpoint deve registrar SHA, PR, CI, testes, decisões, limites, próximo passo, comandos de retomada e condições de parada.
