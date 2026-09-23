# ARCA — Checkpoint 039: M5 Fase D prontidão da credencial Portal integrada

Data: **2026-09-23**.

Estado: **M5 FASES A+B+C+D OFFLINE INTEGRADAS E TESTADAS; CREDENCIAL PORTAL TEM GATE DE PROVENIÊNCIA/FINGERPRINT; M5 LIVE AINDA BLOQUEADO PELO PRIMEIRO 2xx AUTORIZADO**.

## Integração

Issue: #164 — `M5 Fase D — prontidão verificável da credencial Portal sem rede`.

PR: #165 — `feat(m5): adicionar gate de prontidão da credencial Portal`.

Commit canônico:
`e73f3f851790139620e0c4d88128b76a5af57b57`.

CI da PR:
- run #343 / `35856897130`;
- conclusão: **success**;
- M5-A: success;
- M5-B: success;
- M5-C: success;
- M5-D: success;
- repositório/publicação: success.

CI pós-merge:
- run #344 / `35857018857`;
- conclusão: **success**;
- M5-A: success;
- M5-B: success;
- M5-C: success;
- M5-D: success;
- verificação do repositório: success.

## Fonte oficial atual

Em 2026-09-23, a documentação oficial do Portal descreve o fluxo de credencial como:

```text
cadastro de e-mail
    ↓
token recebido por e-mail
    ↓
token usado na API
```

O requisito operacional do ARCA passa a ser baseado nesse fluxo documentado. Login Gov.br não deve ser tratado como pré-condição técnica da credencial sem documentação oficial que o estabeleça.

## Novo componente

`src/investigation/portal-credential-readiness.mjs`

Função: separar quatro coisas que antes podiam ser confundidas:

1. token presente;
2. formato local aceitável;
3. procedência declarada;
4. atividade real perante a API.

Antes da rede:

- `activeState=ACTIVE_UNKNOWN`;
- `activeVerified=false`;
- `networkUsed=false`;
- `networkAuthorized=false`;
- `readyForExplicitAuthorization=true`.

`readyForExplicitAuthorization` não autoriza rede.

## Fingerprint sem revelar o token

O ARCA calcula um fingerprint com separação de domínio:

`SHA-256("arca.portal-api-key.v1\\0" || token)`.

A prova não contém o token.

Isso permite distinguir se dois probes usam a mesma credencial ou uma credencial diferente sem publicar o segredo.

## Proveniência obrigatória

O probe agora exige:

`ARCA_PORTAL_TOKEN_PROVENANCE=OFFICIAL_EMAIL_REGISTRATION`

e:

`ARCA_PORTAL_TOKEN_RECEIVED_AT=<ISO-8601 UTC>`.

Falha de proveniência/metadado ocorre antes do GET.

## Interpretação conservadora do HTTP

- 2xx → `ACCEPTED_ON_OBSERVED_REQUEST`, `activeVerified=true`;
- 401 → `AUTHORIZATION_NOT_ESTABLISHED`;
- 403 → `ACCESS_NOT_ESTABLISHED`;
- 429 → `RATE_LIMITED_ACTIVE_UNKNOWN`;
- 5xx → `SOURCE_ERROR_ACTIVE_UNKNOWN`.

Um 401 não prova sozinho que o token seja inválido. O ARCA preserva o fato observado e não inventa a causa.

Nenhum desses estados autoriza retry automaticamente.

## Workflow Portal

O workflow manual passou a exigir:

- confirmação;
- scope hash;
- proveniência da credencial;
- instante declarado de recebimento;
- token via secret;
- cofre privado.

O preflight ocorre antes da captura. O token permanece apenas em GitHub Secret.

As partes humanas do workflow alteradas nesta fase foram convertidas para português brasileiro.

## O que NÃO aconteceu

- nenhum quarto GET Portal;
- nenhum acesso investigativo novo;
- nenhum token foi impresso ou persistido em claro;
- nenhum 2xx foi fabricado;
- nenhuma causa foi inferida para os 401 anteriores;
- nenhum retry foi autorizado;
- nenhum parser live foi criado.

## Próximo gate operacional

O próximo passo já não é desenvolver mais um mecanismo de autenticação por suposição.

É:

1. obter/confirmar token pelo fluxo oficial de cadastro de e-mail;
2. preservar o token somente como secret;
3. registrar `OFFICIAL_EMAIL_REGISTRATION` e data declarada de recebimento;
4. executar somente o preflight offline;
5. gerar/revisar o manifesto do próximo probe;
6. obter autorização humana explícita para exatamente um GET;
7. executar o GET;
8. se 2xx, M5-C observa o schema real;
9. revisão humana do schema;
10. implementar/testar parser em gate separado;
11. normalizar;
12. alimentar M5-A/B com entradas live.

Não executar novo GET por inferência.

## Frentes congeladas

- Vince permanece no Probe 011;
- Controlled Self-Improvement congelado;
- Edge Steward congelado;
- M10 Produto/Governança/Interface congelado;
- M7-CIV planejado, não ativo.
