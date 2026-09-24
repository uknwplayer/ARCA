# ARCA — M5-J Binding PNCP Live Normalizado V0.1

Estado: **IMPLEMENTADO EM BRANCH / NORMALIZAÇÃO PNCP REAL CONCLUÍDA / PRONTO PARA ENTRADA NA FASE B / CORRELAÇÃO AINDA BLOQUEADA**.

## Objetivo

Preservar duas camadas distintas do PNCP:

1. captura original custodial do run `35547609136`;
2. derivação normalizada privada produzida no run `36026221085`.

O binding não abre novamente a custódia e não contém valores brutos.

## Captura original

- run: `35547609136`;
- revisão: `b20e377f8b9b4f7831e3b4b3877913a5c35ac09e`;
- scope: `1d0354ffdf1bf0971aab175eb170e9bcb05491a708daba015e8b967cdf59b084`;
- envelope: `c707689e04d7bd091a59555d883a2d2a4d716b442b485d8b3b55efa1c65c6202`;
- receipt: `ad1fd3f1c3e09637f48f8e387f47f518392246cb30338704e914bac99028e19b`;
- structure: `4a00de8f61190819cc6e172f45438dcb22dc1c952430fc7a1c79f2cc0dcfabb9`;
- page file: `da9ae12fcea93ed85c85761b08d214f241333be5209ea15b4bda6b627e3f4afc`.

## Normalização privada

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36026221085

Resultado:

- status `NORMALIZED_CUSTODIAL_OFFLINE`;
- 2 registros;
- `normalizationSha256=c91e5bce7240fa6ca127aeeb33f7a7763a891bd84c65ee1a29950e66a32b7a2d`;
- `normalizedEnvelopeSha256=95eaf8fa048860dc2e41edcb1de043405d5e7a0a60d4183420b0fb4bf3791f33`;
- `normalizedContentRootSha256=99cba45df309b2383e5ace89e16fd61ce31f811c84cac33ddfcc151e29a49f7b`;
- `proofSha256=450174620c2490c77953ece5a2aa20d0eec3829e6e45c9d46e4382d9773dc862`;
- private-store receipt `00d024c3b7e9dfc657b2dc8705e93d2a6d2ddadde4dd55718b2c4b46833b9447`;
- `supplierObserved=false`;
- zero novo GET;
- nenhuma publicação;
- nenhuma correlação.

## Cobertura

A página PNCP capturada não contém fornecedor/adjudicatário.

O binding registra obrigatoriamente:

- `supplierObserved=false`;
- `supplierIdentifierAvailable=false`;
- `supplierMayBeInferred=false`.

Qualquer tentativa de alterar essa cobertura falha fechado.

## Compatibilidade com Fase B

O M5-J emite:

- `custodyInput` PNCP com captura original verificada e estado `NORMALIZED`;
- `sourceBinding` com envelope/receipt originais + structure hash + normalization hash;
- `derivedNormalization` com hashes da custódia normalizada privada;
- `coverage` com lacuna de fornecedor explícita.

Para compatibilidade com o contrato atual da Fase B, `observedStructureSha256` é fornecido no campo genérico `observedSchemaSha256` do `sourceBinding`.

## Limites

- nenhuma correlação é executada;
- `correlationAuthorized=false`;
- `publicationAuthorized=false`;
- ausência de fornecedor não pode virar inferência;
- vínculo forte por fornecedor não pode ser criado com esta captura PNCP;
- qualquer correlação futura deverá usar apenas pontes efetivamente observadas e preservar estados `CANDIDATE`, `CONFLICTING` ou `NOT_OBSERVED` quando necessário.

## Validação

`npm run validate:m5-pncp-live-binding`

## Próximo passo

Com Portal M5-I e PNCP M5-J prontos, construir um **gate de prontidão de correlação** que responda se as duas fontes possuem pontes documentais suficientes, sem executar ainda a correlação.

Esse gate deve tratar `supplierObserved=false` como restrição de cobertura e nunca como indício adverso.
