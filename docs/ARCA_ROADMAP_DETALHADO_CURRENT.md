# ARCA — Roadmap detalhado atual

Atualizado em: **2026-09-21**

Base de entrada: `0.4.0-rc.1` / `54be3952d211ec3c5ae49e4ad3e8677189d3d19c`

Regra: este arquivo descreve a sequência vigente. Não substituir gates por ativação direta.

## Marco M0 — Fundação multifonte offline

Estado: **IMPLEMENTADO LOCALMENTE; CI/INTEGRAÇÃO PENDENTES**

Entregas:

- contrato `Public Source Adapter V1`;
- `Evidence Envelope V1`;
- registro com PNCP, Portal da Transparência, Transferegov, CEIS/CNEP, Siconfi, TCU, DOU e FNDE;
- somente PNCP offline executável;
- fixture `AC/AL/AM` com deduplicação e indisponibilidade isolada;
- dois agentes independentes;
- verificação adversarial;
- fila em `HUMAN_REVIEW`;
- rede/publicação desligadas.

Aceite restante: CI verde, revisão da PR, merge e CI pós-merge.

## Marco M1 — Segundo adaptador offline

Objetivo: implementar `br.portal-transparencia.api` ou uma variante oficial de download sem realizar rede.

Passos:

1. congelar fixture pública sintética compatível com o contrato oficial;
2. normalizar órgão, fornecedor, período, documento de despesa e valor;
3. emitir o mesmo `Evidence Envelope V1`;
4. bloquear execução se o registro ainda estiver `DECLARED_ONLY`;
5. promover para `ACTIVE/OFFLINE_FIXTURE` somente junto com testes;
6. provar origem oficial, hashes e lacunas;
7. manter material bruto fora do relatório e publicação off.

Aceite: adaptador executa offline, recusa origem divergente, não exige segredo e não altera o núcleo.

## Marco M2 — Correlação PNCP ↔ execução financeira

Objetivo: relacionar registros sem declarar equivalência apenas por nome ou valor.

Passos:

1. criar identificadores canônicos de órgão e fornecedor;
2. preservar CNPJ/identificadores somente conforme política pública e minimização;
3. correlacionar por chaves fortes quando existentes;
4. classificar relações como `CONFIRMED`, `CANDIDATE`, `CONFLICTING` ou `NOT_OBSERVED`;
5. registrar explicações alternativas e diferença temporal;
6. impedir que `NOT_OBSERVED` seja convertido em desaparecimento ou irregularidade;
7. exigir proveniência por campo.

Aceite: teste positivo, ambíguo, conflitante e ausente; nenhum falso achado automático.

## Marco M3 — Gate offline multifonte completo

Objetivo: repetir o piloto com PNCP + execução financeira.

Passos:

1. três UFs sem município padrão;
2. orçamento fixo de registros;
3. deduplicação entre solicitações humanas e observador;
4. dois agentes independentes com separação de rascunho;
5. verificador adversarial;
6. Human Review Queue;
7. métricas de cobertura, correlação, conflito e ausência;
8. publicação desligada.

Aceite: execução determinística reproduzível e relatório sanitizado.

## Marco M4 — Live controlado de uma fonte por vez

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
