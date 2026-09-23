# ARCA — Checkpoint 050: normalização live concluída e binding M5-I preparado

Data: **2026-09-23**.

Estado: **M5-H EXECUTADO COM SUCESSO; REGISTRO REAL DO GATE 046 NORMALIZADO; RESULTADO RESSELADO E PERSISTIDO NO COFRE PRIVADO; NORMALIZATION SHA PROVADO; M5-I IMPLEMENTADO PARA ADMISSÃO NA FASE B; CORRELAÇÃO AINDA NÃO EXECUTADA; ZERO NOVO GET PORTAL**.

## Execução M5-H real

Run:

https://github.com/uknwplayer/ARCA/actions/runs/35931108034

Revisão:

`bcb0c7064df3294bf31520053de8ab893a71e2fa`

Resultado:

- `NORMALIZED_CUSTODIAL_OFFLINE`;
- candidato admitido `0bcf1806c2480b2f82f8efff43e67436460043375d302fb6fcf44c80ec3e97f9`;
- decisão `343392fae89030cad11d94a165d4aecfe9ba38d39cf618298de8d3e1a2dae420`;
- parser contract `ca862dd6193f05c9280b4e2d36b21485182bb49b5d2419e1c17efffc07942482`;
- observed schema `79f6c837641baf1d6b09c545fe3df836c068ce8a29ff641b6723c477bcd666f6`;
- 1 registro;
- `normalizationSha256=f7306be0478fb603a5fe70957eeb15bf337b7b4db51f6eacbaf699c89f7bcfa7`;
- `normalizedEnvelopeSha256=6cb8513dab0505611e7f376398ca9c2e334131c58265b818fe1b73e8bc72cbcb`;
- `normalizedContentRootSha256=481a750de627383a582b17a01195691ef303aa3f014656745703cafa21c5657d`;
- `proofSha256=eb719af82d385e2cbb7b7c0fffccff36bfff9960fa8300ff1f1645707740f19a`;
- `sourceNetworkUsed=false`;
- `portalRequestUsed=false`;
- `publicationAttempted=false`;
- `correlationAttempted=false`;
- valores normalizados não incluídos na prova;
- bytes crus não incluídos na prova.

## Persistência privada

O envelope normalizado foi gravado no cofre privado.

Recibo sanitizado:

- status `STORED_PRIVATE`;
- commit ref hashado na prova operacional;
- `receiptSha256=39671a927032514d89e474cb81f61215745db88b858f3d43115daf265ee794a6`;
- `plaintextStored=false`.

O plaintext normalizado não foi publicado.

## M5-I

Novo binding:

`src/investigation/m5-portal-live-normalized-binding.mjs`

Config sanitizada:

`config/m5-portal-live-normalized-binding-gate046.json`

Função:

- preservar a captura original como âncora de custódia;
- preservar a custódia normalizada como derivação privada;
- emitir `custodyInput` + `sourceBinding` compatíveis com a Fase B;
- manter `correlationAuthorized=false`.

## Conclusão

O Portal atingiu o estado:

`capturado live → custodial → schema observado → parser admitido → normalização real → nova custódia privada → binding pronto para Fase B`

Ainda não houve correlação com PNCP.

## Próximo passo

Integrar o M5-I e, em gate separado, decidir se a Fase B deve executar correlação documental usando o Portal live normalizado e uma fonte PNCP live compatível.

Checkpoint anterior: [049](ARCA_HANDOFF_CHECKPOINT_2026-09-23_049.md).
