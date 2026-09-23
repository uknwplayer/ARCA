# ARCA — M5-G Gate de Admissão da Normalização Custodial V0.1

Estado: **IMPLEMENTADO EM BRANCH / SEM REDE / SEM ABRIR CUSTÓDIA / DECISÃO HUMANA PENDENTE**.

## Objetivo

Separar a existência de um parser offline testado da autorização para aplicá-lo aos bytes reais já custodiais do Gate 046.

O M5-G não normaliza nenhum valor. Ele produz um candidato sanitizado que vincula:

- revisão exata do código;
- parser contract V1;
- schema estrutural observado no Gate 046;
- envelope custodial;
- receipt custodial;
- hash dos bytes de resposta;
- scope do Gate 046.

## Binding canônico do Gate 046

- live run: `35917902630`;
- `observedSchemaSha256=79f6c837641baf1d6b09c545fe3df836c068ce8a29ff641b6723c477bcd666f6`;
- `custodyEnvelopeSha256=d398da542596a7ad387f0d1c5bbe2b9e201e00e1f812507a7e2c97b16d421db5`;
- `custodyReceiptSha256=1ed2cadf58f1a3213271387400e3015089c24c690b7e1c948eb63d056c564cbc`;
- `responseBytesSha256=9f2d6cde37f88966204e84121da6b935f4082c7fdfa5f785f3fa649065720e66`;
- `scopeSha256=38637de67d7f7eb5a5fc57fa327069c20857bd7ae7ed62b8072312a2fad37eb1`.

## Candidato

Estado obrigatório:

`AWAITING_HUMAN_ADMISSION`

Flags obrigatórias:

- `liveNormalizationAuthorized=false`;
- `networkAuthorized=false`;
- `publicationAuthorized=false`;
- `correlationAuthorized=false`;
- `humanAdmissionRequired=true`;
- `rawBytesIncluded=false`;
- `sourceValuesIncluded=false`.

## Decisões humanas possíveis

- `ADMIT_FOR_CUSTODIAL_NORMALIZATION`;
- `REJECT_PARSER`;
- `HOLD_FOR_MORE_EVIDENCE`.

Mesmo a decisão de admissão autoriza somente **normalização custodial offline**.

Ela mantém:

- rede proibida;
- publicação proibida;
- correlação proibida;
- qualquer novo GET proibido.

## Segurança

A decisão deve citar o `candidateSha256` exato. Hash divergente falha fechado.

A admissão não é inferida de um “continue/prossiga” genérico: deve ser uma decisão explicitamente vinculada ao candidato gerado.

## Próximo passo

Após CI/merge:

1. disparar o preflight M5-G em revisão final;
2. registrar o `candidateSha256`;
3. obter decisão humana explícita sobre aquele candidato;
4. somente se admitido, implementar/executar normalização privada dos bytes já custodiais;
5. produzir `normalizationSha256`;
6. manter correlação/publicação bloqueadas até gate posterior.

Nenhum novo request ao Portal é necessário.
