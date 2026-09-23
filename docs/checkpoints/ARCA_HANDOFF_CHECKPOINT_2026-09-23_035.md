# ARCA — Checkpoint 035: M5 Fase B Post-Custody Correlation integrada

Data: **2026-09-23**.

Estado: **M5 FASE A + FASE B OFFLINE INTEGRADAS E TESTADAS; CAMINHO PÓS-CUSTÓDIA ATÉ HUMAN_REVIEW PRONTO; M5 LIVE AINDA NÃO ACEITO; PORTAL AINDA SEM PRIMEIRO 2xx/SCHEMA REAL; VINCE/EDGE CONGELADOS**.

## Integração

Issue: #154 — `M5 Phase B — post-custody correlated review gate`.

PR: #155 — `feat(m5): add post-custody correlated review gate`.

Commit canônico:
`2230791a5bf377199a63d8a06e95d36f32ebf412`.

CI da PR:
- run `35850287815` (#328);
- job `107146088400`;
- conclusão: **success**;
- M5 Phase A pre-correlation: **success**;
- M5 Phase B post-custody: **success**.

CI pós-merge:
- run `35850394372` (#329);
- job `107146426401`;
- conclusão: **success**;
- M5 Phase A: **success**;
- M5 Phase B: **success**.

## O que a Fase B adiciona

Novo módulo:
`src/investigation/m5-post-custody-correlation.mjs`.

Fluxo provado offline:

```text
manifesto M5
   ↓
pre-correlation READY
   ↓
bundle normalizado vinculado à custódia
   ↓
correlação financeira
   ↓
PROVENANCE_ANALYST
   +
COMPARABILITY_ANALYST
   ↓
verificação adversarial
   ↓
HUMAN_REVIEW
```

## Binding de custódia

Entradas normalizadas não são aceitas apenas porque possuem o formato esperado.

A Fase B exige:

- pagamentos e impactos financeiros ancorados ao envelope custodial Portal;
- contratações ancoradas ao envelope custodial PNCP;
- strong bridges com proveniência das duas famílias;
- hashes de envelope/recibo idênticos aos do gate M5-A;
- estado `NORMALIZED`;
- hashes de schema observado e normalização presentes.

Se qualquer binding estiver ausente ou divergente, a correlação falha fechada.

## Orçamento e estados epistêmicos

O orçamento `maxCorrelationRelations` do manifesto é aplicado antes da continuação.

A fixture de contrato preserva os quatro estados:

- `CONFIRMED`;
- `CANDIDATE`;
- `CONFLICTING`;
- `NOT_OBSERVED`.

`CONFIRMED` continua significando somente vínculo documental representado. Não prova regularidade, entrega, adequação de preço, intenção ou ilícito.

`NOT_OBSERVED` permanece ausência observada no escopo, não desaparecimento ou irregularidade.

## Dois agentes e verificação adversarial

A Fase B exige exatamente:

- `PROVENANCE_ANALYST`;
- `COMPARABILITY_ANALYST`.

Ambos recebem o mesmo digest imutável e não podem gerar achado adverso automático.

A verificação adversarial preserva:

- custody binding;
- observed-schema/normalization binding;
- cross-source bridge provenance;
- `CONFLICTING`;
- `NOT_OBSERVED`;
- diferenças de alocação financeira para revisão.

Também registra deliberadamente:

`PHASE_B_IS_OFFLINE_CONTRACT_PROOF`.

Esse desafio impede que o teste seja confundido com evidência live.

## Estado de segurança

A saída exige:

- `network.used=false`;
- `publication.attempted=false`;
- `adverseFinding=false`;
- `m5Accepted=false`;
- `phaseBOfflineContractProof=true`;
- `rawLiveBytesIncluded=false`;
- revisão humana obrigatória.

## CI canônico

O workflow principal agora executa explicitamente:

```bash
npm run validate:m5-phase-a
npm run validate:m5-phase-b
```

Assim, regressões futuras no gate pré-correlação ou no caminho pós-custódia quebram o CI canônico.

## O que NÃO foi feito

Neste ciclo:

- nenhum novo GET Portal;
- nenhum novo GET PNCP;
- nenhum token usado;
- nenhum quarto GET Portal autorizado ou executado;
- nenhum schema Portal live inventado;
- nenhum parser live criado a partir de fixture;
- nenhuma publicação;
- nenhum encaminhamento;
- nenhum achado adverso.

## Bloqueio live remanescente

O M5 ainda depende de um primeiro **2xx real e autorizado do Portal da Transparência**.

Sequência correta quando a autenticação estiver resolvida:

1. confirmação oficial de token ativo;
2. nova autorização explícita e limitada para um novo GET;
3. captura 2xx em custódia privada;
4. observar o schema real;
5. criar/revisar parser baseado no schema observado;
6. normalizar preservando hashes de custódia;
7. alimentar M5-A/M5-B com evidência live;
8. somente então avaliar aceite do M5.

Até lá, não executar novo GET por inferência.

## Linhas paralelas

- Vince permanece estável no Probe 011.
- `Controlled Self-Improvement` continua congelado até a conclusão do ARCA.
- Edge Steward continua congelado.
- M5-R continua dependente do aceite M5.

## Retomada

Ler primeiro este checkpoint, depois:
- `docs/ARCA_M5_POST_CUSTODY_CORRELATION_V0_1.md`;
- `docs/ARCA_M5_LIVE_CORRELATED_DESIGN_V0_1.md`;
- `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`.

Não fabricar schema Portal e não executar quarto GET sem nova autorização explícita.
