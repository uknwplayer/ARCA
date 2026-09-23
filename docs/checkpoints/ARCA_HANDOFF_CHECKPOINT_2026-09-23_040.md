# ARCA — Checkpoint 040: M5 Fase E integrada e Gate 040 pronto para prova operacional

Data: **2026-09-23**.

Estado: **M5 FASES A+B+C+D+E OFFLINE INTEGRADAS E TESTADAS; GATE 040 IMPLEMENTADO E TESTADO SEM CAPABILITY DE GET PORTAL; PROVA OPERACIONAL DO PREFLIGHT PENDENTE; NENHUM QUARTO GET AUTORIZADO**.

## Integração M5-E

Issue: #172 — `M5 Fase E — vincular o probe live ao preflight isolado`.

PR: #173 — `feat(m5): vincular probe live ao preflight isolado`.

Commit canônico:
`266143fa534e83152b77d69a8b2407333f771149`.

CI da PR:
- run #356 / `35864841504`;
- conclusão: **success**;
- M5-A/B/C/D/E: success;
- Gate 040 offline: success;
- verificação do repositório/publicação: success.

CI pós-merge:
- run #357 / `35864999971`;
- conclusão: **success**;
- M5-A/B/C/D/E: success;
- Gate 040 offline: success;
- verificação do repositório: success.

## Gate 040

Implementação:
- PR #168;
- commit `ca39f634d22e3a9deedac8cd798e6bae875914ee`;
- CI da PR #348: success;
- CI pós-merge #349 / `35858858934`: success.

O Gate 040 é um workflow manual separado que **não contém transporte nem etapa de captura do Portal**.

Ele valida:

- presença/formato/proveniência da credencial;
- fingerprint sanitizado da credencial;
- scope derivado;
- revisão;
- documento por hash;
- disponibilidade e privacidade do cofre;
- branch/repositório custodial.

Agora também produz:

`preflightSha256`.

A prova operacional com os secrets reais ainda não foi executada. A issue #167 permanece aberta até essa prova.

## M5-E — vínculo entre autorização e estado revisado

O probe live passa a exigir três vínculos:

- `scope_sha256`;
- `preflight_sha256`;
- `credential_fingerprint_sha256`.

Antes de criar o transporte HTTP, o probe recalcula a atestação usando o estado atual.

Qualquer mudança em:

- revisão;
- documento;
- token;
- repositório de custódia;
- branch de custódia;

faz o binding divergir e encerra a execução antes da rede.

```text
Gate 040
   ↓
scopeHash + fingerprint + preflightSha256
   ↓
revisão humana
   ↓
autorização explícita separada
   ↓
probe recalcula binding
   ↓
igual?
 ├─ não → FAIL CLOSED / 0 GET
 └─ sim → transporte pode ser criado para o único GET autorizado
```

Sucesso do Gate 040 **não autoriza rede**.

## Segurança preservada

- token não entra no digest;
- código bruto do documento não entra no digest;
- segredo do cofre não entra no digest;
- `retries=0`;
- nenhuma autorização antiga sobrevive a drift do estado;
- publicação permanece desligada;
- revisão humana continua obrigatória.

## O que NÃO aconteceu

- nenhum quarto GET Portal;
- nenhuma requisição nova ao endpoint investigativo;
- nenhum 2xx fabricado;
- nenhum token publicado;
- nenhuma correlação live nova;
- nenhuma ativação das frentes futuras congeladas.

## Próximo gate operacional

1. executar o **Gate 040 isolado** com os secrets reais e os metadados de credencial já confirmados;
2. coletar somente a saída sanitizada:
   - `preflightSha256`;
   - `scopeHash`;
   - `credentialFingerprintSha256`;
   - `ACTIVE_UNKNOWN`;
   - confirmação de cofre privado;
3. revisar esses hashes;
4. manter o quarto GET bloqueado;
5. somente mediante autorização humana explícita posterior para exatamente um GET, preencher o workflow live com os três vínculos;
6. se houver 2xx: custódia → M5-C → revisão do schema → parser em gate separado → normalização → M5-A/B.

Não executar o quarto GET por inferência.

## Frentes congeladas

Continuam congeladas:
- Vince Controlled Self-Improvement;
- Edge Steward;
- M10 Produto/Governança/Interface;
- M7-CIV;
- Runtime Autônomo Local;
- ARCA AI Gateway.

O ARCA Device Agent permanece apenas como caminho futuro preferencial documentado.
