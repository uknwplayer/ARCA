# ARCA — M5-K Gate de Prontidão de Correlação V0.1

Estado: **IMPLEMENTADO EM BRANCH / OFFLINE / SEM ABRIR VALORES PRIVADOS / SEM CORRELAÇÃO**.

## Objetivo

Avaliar, usando somente os bindings sanitizados M5-I e M5-J, se PNCP e Portal possuem pontes documentais suficientes para uma correlação forte.

O gate não abre o envelope normalizado, não compara valores privados e não executa o correlator.

## Fontes

Portal:

- captura live custodial;
- 1 registro normalizado;
- M5-I válido.

PNCP:

- captura histórica custodial;
- 2 registros normalizados;
- M5-J válido;
- `supplierObserved=false`.

## Inventário de pontes

### Fornecedor

Classificação:

`UNAVAILABLE_BY_PNCP_COVERAGE`

Motivo: a página PNCP capturada não inclui fornecedor/adjudicatário.

Consequências:

- `supplierBridgeAvailable=false`;
- `supplierInferenceAllowed=false`;
- nenhuma ponte forte por fornecedor pode ser criada.

### Identificador forte de órgão compartilhado

Classificação:

`NO_SHARED_STRONG_IDENTIFIER`

PNCP possui CNPJ estruturado do órgão. O Portal atual preserva órgão/unidade como texto, sem identificador forte compartilhado no binding.

### Referência cross-source direta

Classificação:

`NOT_OBSERVED`

Nenhum identificador direto de uma fonte apontando para a outra foi observado.

### Referência documental

Classificação:

`CANDIDATE_PRIVATE_COMPARISON`

Ambas as fontes possuem referências documentais, mas com semânticas diferentes. Igualdade textual futura não pode ser tratada automaticamente como equivalência.

### Texto de órgão/unidade

Classificação:

`CANDIDATE_PRIVATE_COMPARISON`

Pode servir para triagem privada, não como identificador forte.

### Data

Classificação:

`WEAK_CONTEXT_ONLY`

Pode apoiar comparabilidade temporal, nunca identidade por si só.

### Valor

Classificação:

`WEAK_CONTEXT_ONLY`

Pode apoiar triagem, nunca provar vínculo por si só.

## Resultado global

`LIMITED_CANDIDATE_SCREENING_ONLY`

Flags:

- `readyForStrongCorrelation=false`;
- `readyForPrivateCandidateScreening=true`;
- `candidateScreeningRequiresPrivateValues=true`;
- `correlationAttempted=false`;
- `correlationAuthorized=false`;
- `networkUsed=false`;
- `publicationAttempted=false`;
- `adverseFinding=false`;
- `humanReviewRequired=true`.

## Próximo passo

Criar um gate separado de **triagem privada de candidatos**.

Esse gate poderá abrir apenas as normalizações privadas já custodiais para comparar:

- referências documentais;
- textos de órgão/unidade;
- janelas temporais;
- valores.

Mesmo se houver coincidências, a saída deve ser apenas `CANDIDATE`, nunca `CONFIRMED`, enquanto não existir ponte forte observada.

Nenhum novo GET é necessário para essa triagem.
