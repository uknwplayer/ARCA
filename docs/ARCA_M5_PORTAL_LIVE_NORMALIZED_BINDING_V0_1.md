# ARCA — M5-I Binding Live Normalizado Portal V0.1

Estado: **IMPLEMENTADO EM BRANCH / NORMALIZAÇÃO LIVE COMPROVADA / CORRELAÇÃO BLOQUEADA**.

## Objetivo

Representar de forma auditável o resultado real da normalização custodial do Gate 046 sem confundir:

1. a custódia original da resposta capturada;
2. a custódia derivada do registro normalizado.

O binding M5-I verifica a cadeia inteira e só então emite os objetos compatíveis com a Fase B.

## Cadeia live

Captura:

- run `35917902630`;
- revisão `44b2dd9b5bc25c216d9b599fb552ea0fbb063c5f`;
- scope `38637de67d7f7eb5a5fc57fa327069c20857bd7ae7ed62b8072312a2fad37eb1`;
- envelope `d398da542596a7ad387f0d1c5bbe2b9e201e00e1f812507a7e2c97b16d421db5`;
- receipt `1ed2cadf58f1a3213271387400e3015089c24c690b7e1c948eb63d056c564cbc`;
- response bytes `9f2d6cde37f88966204e84121da6b935f4082c7fdfa5f785f3fa649065720e66`;
- observed schema `79f6c837641baf1d6b09c545fe3df836c068ce8a29ff641b6723c477bcd666f6`.

Admissão:

- candidate `0bcf1806c2480b2f82f8efff43e67436460043375d302fb6fcf44c80ec3e97f9`;
- decision `343392fae89030cad11d94a165d4aecfe9ba38d39cf618298de8d3e1a2dae420`;
- parser contract `ca862dd6193f05c9280b4e2d36b21485182bb49b5d2419e1c17efffc07942482`.

Normalização real:

- run `35931108034`;
- executor revision `bcb0c7064df3294bf31520053de8ab893a71e2fa`;
- `normalizationSha256=f7306be0478fb603a5fe70957eeb15bf337b7b4db51f6eacbaf699c89f7bcfa7`;
- normalized envelope `6cb8513dab0505611e7f376398ca9c2e334131c58265b818fe1b73e8bc72cbcb`;
- normalized content root `481a750de627383a582b17a01195691ef303aa3f014656745703cafa21c5657d`;
- private store receipt `39671a927032514d89e474cb81f61215745db88b858f3d43115daf265ee794a6`;
- proof `eb719af82d385e2cbb7b7c0fffccff36bfff9960fa8300ff1f1645707740f19a`;
- record count: 1.

## Saída para a Fase B

O M5-I emite:

- `custodyInput` usando a **custódia original** como âncora;
- `sourceBinding` usando a mesma custódia original + `normalizationSha256`;
- `derivedNormalization` apontando separadamente para a custódia normalizada privada.

Isso mantém compatibilidade com o contrato atual da Fase B sem reescrever a proveniência.

## Segurança

- `normalizationState=NORMALIZED`;
- custódia privada confirmada;
- nenhum valor normalizado entra no binding público;
- nenhuma correlação é executada;
- nenhuma publicação é autorizada;
- nenhum novo GET Portal é necessário.

## Próximo passo

Após CI/merge, o Portal poderá ser considerado **fonte normalizada live pronta para admissão na Fase B**.

Isso não autoriza executar a correlação. A correlação PNCP↔Portal permanece um passo separado.
