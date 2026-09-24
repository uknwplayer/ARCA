# ARCA — Checkpoint 053: Gate M5-K de prontidão de correlação

Data: **2026-09-24**.

Estado: **PORTAL M5-I E PNCP M5-J PRONTOS; GATE M5-K IMPLEMENTADO OFFLINE; CORRELAÇÃO FORTE NÃO ESTÁ PRONTA; TRIAGEM PRIVADA DE CANDIDATOS É O PRÓXIMO PASSO POSSÍVEL; ZERO NOVO GET; ZERO CORRELAÇÃO EXECUTADA**.

## Base

Portal M5-I:

- 1 registro normalizado;
- custódia privada derivada;
- `correlationAuthorized=false`.

PNCP M5-J:

- 2 registros normalizados;
- run `36026221085`;
- `normalizationSha256=c91e5bce7240fa6ca127aeeb33f7a7763a891bd84c65ee1a29950e66a32b7a2d`;
- `supplierObserved=false`;
- `supplierMayBeInferred=false`;
- `correlationAuthorized=false`.

## Gate M5-K

Novo componente:

`src/investigation/m5-correlation-readiness.mjs`

Validador:

`npm run validate:m5-correlation-readiness`

O gate trabalha somente com bindings sanitizados. Ele não abre os envelopes normalizados.

## Resultado estrutural

Status:

`LIMITED_CANDIDATE_SCREENING_ONLY`

Pontes fortes indisponíveis:

- fornecedor: indisponível por cobertura PNCP;
- identificador forte compartilhado de órgão: não disponível;
- referência cross-source direta: não observada.

Dimensões candidatas:

- referência documental;
- texto de órgão/unidade.

Dimensões fracas/contextuais:

- data;
- valor.

## Segurança

- `readyForStrongCorrelation=false`;
- `readyForPrivateCandidateScreening=true`;
- `supplierInferenceAllowed=false`;
- `networkUsed=false`;
- `correlationAttempted=false`;
- `correlationAuthorized=false`;
- `publicationAttempted=false`;
- `adverseFinding=false`;
- revisão humana obrigatória.

## Interpretação

O fato de existirem duas fontes normalizadas não é suficiente para declarar que um documento financeiro corresponde a uma contratação.

Sem fornecedor ou outro identificador cross-source forte, coincidência de nome, data ou valor permanece apenas uma hipótese documental.

## Próximo passo

M5-L — triagem privada de candidatos:

1. transportar apenas as normalizações privadas já existentes;
2. comparar campos allowlisted;
3. não criar equivalência por nome/valor;
4. emitir apenas candidatos com explicações e contraprovas;
5. manter correlação forte e publicação bloqueadas.

Nenhuma nova aquisição pública é necessária.

Checkpoint anterior: [052](ARCA_HANDOFF_CHECKPOINT_2026-09-24_052.md).
