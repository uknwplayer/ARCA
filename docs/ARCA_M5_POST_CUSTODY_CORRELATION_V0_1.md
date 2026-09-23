# ARCA — M5 Fase B: Post-Custody Correlation Gate V0.1

Status: **IMPLEMENTAÇÃO CANDIDATA / OFFLINE / SEM NOVO ACESSO DE REDE**.

Issue: #154.

## Objetivo

Preparar o trecho executável do M5 que começa somente depois de PNCP e Portal já possuírem:

- escopo pré-registrado;
- custódia privada verificada;
- schema observado;
- normalização revisada;
- estado `NORMALIZED`.

Fluxo:

```text
M5 manifest
   ↓
pre-correlation gate READY
   ↓
normalized bundle bound to custody
   ↓
financial correlation
   ↓
PROVENANCE_ANALYST
   +
COMPARABILITY_ANALYST
   ↓
adversarial verification
   ↓
HUMAN_REVIEW
```

Esta fase não executa GET, não usa token, não interpreta bytes live e não aceita o M5 como concluído.

## Binding de custódia

Cada família recebe uma âncora:

`custody:<SOURCE>:sha256:<envelopeSha256>`

Regras fail-closed:

- pagamentos Portal devem incluir a âncora Portal;
- impactos pagamento→empenho devem incluir a âncora Portal;
- contratações PNCP devem incluir a âncora PNCP;
- bridges fortes entre empenho e contratação devem incluir ambas as âncoras;
- hashes de envelope e recibo devem ser idênticos aos do gate pré-correlação;
- normalização deve estar em `NORMALIZED`.

Um registro sem ligação custodial não pode entrar no correlator.

## Orçamento

O total de relações produzido pelo correlator é limitado por:

`manifest.budgets.maxCorrelationRelations`

Excesso falha com `ARCA_M5_PHASE_B_CORRELATION_BUDGET_EXCEEDED`.

## Dois analistas

A Fase B exige exatamente dois papéis independentes:

- `PROVENANCE_ANALYST`;
- `COMPARABILITY_ANALYST`.

Os dois recebem o mesmo `inputDigest`, não podem gerar achado adverso e mantêm revisão humana obrigatória.

## Verificação adversarial

O gate verifica explicitamente:

- custódia das duas fontes;
- hashes de schema observado e normalização;
- proveniência de bridges cross-source;
- preservação de `CONFLICTING`;
- preservação de `NOT_OBSERVED`;
- diferenças de alocação financeira que exigem revisão.

A própria execução de Fase B registra um desafio não resolvido:

`PHASE_B_IS_OFFLINE_CONTRACT_PROOF`

Isso impede interpretar este teste como evidência live ou aceite final do M5.

## Saída

A saída sanitizada contém:

- hashes do manifesto, gate e bundle;
- hashes custodiais;
- hash do relatório de correlação;
- contagens e estados epistêmicos;
- dois relatórios independentes;
- desafios adversariais;
- investigação em `HUMAN_REVIEW`.

Nunca contém bytes brutos live ou segredo.

Flags obrigatórias:

- `network.used=false`;
- `publication.attempted=false`;
- `adverseFinding=false`;
- `m5Accepted=false`;
- `phaseBOfflineContractProof=true`.

## Limite atual

O primeiro schema Portal live 2xx ainda não foi observado. Portanto esta Fase B prova o **contrato pós-custódia**, não a cadeia M5 live completa.

Quando a autenticação Portal for resolvida e houver nova autorização explícita, o parser real deve ser construído a partir do schema efetivamente observado; somente então uma entrada live poderá alimentar este gate.

## Reprodução

```bash
node --test tests/m5-post-custody-correlation.test.mjs
npm run validate:m5-phase-b
```
