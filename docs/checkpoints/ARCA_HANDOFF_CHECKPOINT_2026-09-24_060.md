# ARCA — Checkpoint 060: preflight M5-N1 concluído e candidato canônico emitido

Data: **2026-09-24**.

Estado: **M5-N1 INTEGRADO NO MAIN; CI PÓS-MERGE VERDE; PREFLIGHT PRIVADO CONCLUÍDO; 2 ALVOS HASH-BOUND; ZERO SOURCE GET; LIVE CONTINUA DORMENTE; NOVA AUTORIZAÇÃO HUMANA PENDENTE**.

## Integração

PR:

https://github.com/uknwplayer/ARCA/pull/206

Commit main:

`15d3afc17d0b00b293c98fe86505caac5671bab3`

CI pós-merge:

https://github.com/uknwplayer/ARCA/actions/runs/36044297566

Conclusão: **success**.

## Preflight privado M5-N1

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36044350610

Estado:

`READY_FOR_EXPLICIT_SOURCE_AUTHORIZATION`

`planSha256=75b7910e40b1873a5f694c13eda1c4e00ae1b10ad52e8ebb4c36ef968b29b0b7`

`candidateSha256=13816eb8bd0582c0046018fffd652ddc425a2258cc0802453767dcf4f0bdd844`

Target hashes:

- `4336a7fc26ca7dfc7e9b9ca255071e082a66f32c14a12a42f5cf330ea003812d`;
- `30294cc8a361260756cc07e5156aea672167fd8e71986bb0ed8b590e9a865abf`.

## Escopo

O candidato representa exatamente:

- 2 contratações já normalizadas;
- 1 GET de itens por contratação;
- `pagina=1`;
- `tamanhoPagina=50`;
- `maxRequests=2`;
- `retries=0`;
- timeout 30 s;
- 512 KiB por resposta;
- sem consulta de resultados;
- sem fornecedor;
- sem publicação;
- sem correlação.

## Regra de completude

Se qualquer resposta tiver 50 itens, o ARCA marca cobertura potencialmente truncada e não libera M5-N2.

Se houver menos de 50 itens, somente os itens com `temResultado=true` poderão gerar alvos M5-N2.

## Estado de autorização

**Nenhum GET M5-N1 foi executado.**

O candidato ainda possui:

- `sourceNetworkAuthorized=false`;
- `newPncpGetAuthorized=false`;
- `publicationAuthorized=false`;
- `correlationAuthorized=false`.

## Próximo passo

Obter autorização humana explícita para exatamente os 2 GETs M5-N1 vinculados ao candidato canônico.

Depois do live:

- custodiar respostas;
- observar itemCount/temResultado;
- avaliar truncamento;
- somente então construir M5-N2.

Checkpoint anterior: [059](ARCA_HANDOFF_CHECKPOINT_2026-09-24_059.md).
