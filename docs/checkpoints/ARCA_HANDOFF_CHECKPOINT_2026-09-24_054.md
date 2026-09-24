# ARCA — Checkpoint 054: triagem privada M5-L concluída sem candidato

Data: **2026-09-24**.

Estado: **M5-L EXECUTADO COM SUCESSO; 2 PARES AVALIADOS; 0 CANDIDATOS; 0 CONFIRMADOS; NENHUMA PONTE FORTE OBSERVADA; NENHUMA COINCIDÊNCIA DOCUMENTAL/TEXTUAL/TEMPORAL/MONETÁRIA NOS PARES; ZERO NOVO GET; ZERO CORRELAÇÃO FORTE; ZERO PUBLICAÇÃO DE VALORES**.

## Execução

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36028937585

Revisão:

`672d410cbdf1a73d7ed2a5dfb1edef828a9f4279`

Resultado sanitizado:

- `status=NO_CANDIDATE_BRIDGE_OBSERVED`;
- `pairCount=2`;
- `candidateCount=0`;
- `notObservedCount=2`;
- `confirmedCount=0`;
- `strongBridgeObserved=false`;
- `supplierBridgeObserved=false`;
- `supplierInferenceAllowed=false`;
- `correlationAttempted=false`;
- `sourceNetworkUsed=false`;
- `portalRequestUsed=false`;
- `pncpRequestUsed=false`;
- `publicationAttempted=false`;
- `privateValuesIncluded=false`;
- `humanReviewRequired=true`;
- `adverseFinding=false`.

Hash da triagem:

`screeningSha256=06440986b4e2a360e13add77709ab6b2bc1b9d66847cb71173618f9c32881e95`

Digest do artifact sanitizado:

`sha256:dafb3f3769ff31bf3d801a2720596efecbebb9ade83d1bff0dd49578088f66fd`

## Resultado por par

Foram avaliados exatamente os 2 pares possíveis entre:

- 1 registro Portal normalizado;
- 2 registros PNCP normalizados.

Nos dois pares:

- `documentReferenceExact=false`;
- `agencyTextExact=false`;
- `sameDate=false`;
- `within30Days=false`;
- `amountExact=false`;
- classificação `NOT_OBSERVED`.

Nenhum nome, documento bruto, data bruta ou valor monetário foi publicado no resultado.

## Interpretação técnica

A custódia atual não fornece evidência documental suficiente nem mesmo para classificar um par como candidato.

Isso **não** significa inexistência de relação entre fatos do mundo real. Significa apenas que, dentro das duas capturas atuais e das dimensões allowlisted, nenhuma ponte foi observada.

Da mesma forma:

`NOT_OBSERVED != AUSÊNCIA NO MUNDO REAL != IRREGULARIDADE`

## Limite de cobertura

O principal limite estrutural permanece:

`supplierObserved=false`

A captura PNCP atual não inclui fornecedor/adjudicatário. Também não foi observado identificador cross-source direto nem identificador forte de órgão compartilhado com o Portal.

## Próximo passo seguro

Não executar correlação forte M5-B com estas capturas.

O próximo avanço racional é ampliar **cobertura documental**, procurando em fonte pública oficial uma superfície que forneça pelo menos uma das pontes hoje ausentes:

1. fornecedor/adjudicatário vinculado à contratação PNCP;
2. identificador de órgão/unidade compartilhável entre PNCP e execução financeira;
3. referência documental cross-source direta.

A pesquisa e o desenho podem ser feitos sem nova aquisição live. Qualquer novo GET de fonte deve continuar sob gate próprio, escopo limitado e autorização aplicável.

Checkpoint anterior: [053](ARCA_HANDOFF_CHECKPOINT_2026-09-24_053.md).
