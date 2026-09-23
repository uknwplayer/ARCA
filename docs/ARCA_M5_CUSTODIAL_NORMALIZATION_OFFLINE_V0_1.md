# ARCA — M5-H Normalização Custodial Offline V0.1

Estado: **AUTORIZAÇÃO HUMANA REGISTRADA / EXECUTOR LOCAL-ONLY IMPLEMENTADO / EXECUÇÃO LIVE AINDA NÃO REALIZADA**.

## Autorização canônica

Candidato admitido:

`candidateSha256=0bcf1806c2480b2f82f8efff43e67436460043375d302fb6fcf44c80ec3e97f9`

Revisão do candidato:

`df9a3f29e5d824c8ed39914e7133551edec044e8`

Decisão:

`ADMIT_FOR_CUSTODIAL_NORMALIZATION`

Restrições preservadas:

- rede de fonte: proibida;
- novo GET Portal: proibido;
- publicação: proibida;
- correlação: proibida.

Registro:

`config/m5-portal-parser-admission-gate046.json`

## Executor local-only

Componente:

`src/investigation/m5-portal-custodial-normalization.mjs`

CLI:

`scripts/normalize-m5-portal-custody-local.mjs`

O executor não baixa artefatos, não chama GitHub, não chama o Portal e não possui transporte HTTP.

Ele exige que estejam **já locais no mesmo ambiente**:

1. o envelope criptografado do Gate 046;
2. a passphrase de custódia;
3. o código ARCA com parser M5-F;
4. o registro de admissão M5-G.

## Verificações antes da normalização

O executor recusa continuar se qualquer vínculo divergir:

- `candidateSha256`;
- decisão humana;
- parser contract hash;
- observed schema hash;
- envelope hash;
- receipt hash;
- response bytes hash;
- scope hash.

Depois da abertura do envelope:

- exige exatamente `response.bin`;
- revalida SHA-256 dos bytes;
- roda novamente o observador M5-C;
- exige o mesmo `observedSchemaSha256`;
- só então aplica o parser V1.

## Saída privada

A normalização real, quando executada, produz um documento privado com valores normalizados e imediatamente o sela em um novo envelope criptografado.

A prova sanitizada contém somente:

- hashes;
- quantidade de registros;
- estado da normalização;
- flags de segurança.

Ela não contém nomes, documentos, valores monetários ou bytes brutos.

Flags obrigatórias:

- `sourceNetworkUsed=false`;
- `portalRequestUsed=false`;
- `publicationAttempted=false`;
- `correlationAttempted=false`;
- `normalizedValuesIncludedInProof=false`;
- `rawBytesIncludedInProof=false`;
- `humanReviewRequired=true`;
- `adverseFinding=false`.

## Limite operacional atual

A custódia live e a passphrase existem no ecossistema privado do GitHub, mas não estão co-localizadas neste executor sem transporte.

Como a autorização humana exige **sem rede**, o ARCA não deve buscar o envelope no GitHub nem usar um workflow que faça download de custódia por baixo e depois chamar isso de offline.

Portanto, a execução real permanece pendente até existir um ambiente local onde envelope + passphrase já estejam presentes.

Isso não é falha do parser. É uma fronteira explícita de transporte de custódia.

## Validação

`npm run validate:m5-custodial-admission`

`node --test tests/m5-portal-custodial-normalization.test.mjs`

## Próximo passo

Escolher um caminho que preserve a decisão humana:

- **local estrito:** materializar envelope + passphrase no Termux/ambiente local sem o executor fazer rede e executar o CLI;
- **transporte de custódia controlado:** autorização humana separada para buscar apenas o envelope criptografado do repositório privado, mantendo Portal, publicação e correlação proibidos.

Até essa escolha, nenhuma normalização live deve ser declarada como concluída.
