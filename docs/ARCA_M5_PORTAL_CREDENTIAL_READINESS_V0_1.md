# ARCA — M5 Fase D: Prontidão verificável da credencial Portal V0.1

Estado: **IMPLEMENTAÇÃO CANDIDATA / OFFLINE / SEM NOVO GET**.

Issue: #164.

## Objetivo

Impedir que a presença de um secret seja confundida com prova de que a credencial do Portal está ativa.

A documentação oficial consultada em 2026-09-23 descreve o fluxo como:

```text
cadastro de e-mail no Portal
        ↓
token recebido por e-mail
        ↓
token usado nas consultas da API
```

Fonte oficial de cadastro:

`https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email`

Documentação oficial:

`https://portaldatransparencia.gov.br/api-de-dados`

A documentação atual não estabelece login Gov.br como requisito técnico para emissão/uso do token. O ARCA não deve registrar essa suposição como pré-condição.

## Estados distintos

O gate separa:

1. credencial presente;
2. formato local aceitável;
3. procedência declarada como `OFFICIAL_EMAIL_REGISTRATION`;
4. fingerprint criptográfico;
5. atividade real perante a API.

Antes de rede:

```text
activeState = ACTIVE_UNKNOWN
activeVerified = false
networkUsed = false
networkAuthorized = false
readyForExplicitAuthorization = true
```

`readyForExplicitAuthorization=true` significa apenas que a credencial pode participar de um futuro gate humano de autorização. Não libera rede.

## Fingerprint

O token nunca é persistido nem impresso.

O identificador é:

```text
SHA-256("arca.portal-api-key.v1\0" || bytes_do_token)
```

Isso permite distinguir troca/reuso de credencial entre probes sem expor o segredo.

## Proveniência

Valor obrigatório:

`OFFICIAL_EMAIL_REGISTRATION`

É uma declaração operacional de que o token usado foi recebido pelo fluxo oficial documentado de cadastro por e-mail.

Não prova atividade do token.

## Resultado observado

Somente uma resposta 2xx da própria API, no request explicitamente autorizado, pode produzir:

`ACCEPTED_ON_OBSERVED_REQUEST`

e:

`activeVerified=true`

Outros estados permanecem conservadores:

- 401 → `AUTHORIZATION_NOT_ESTABLISHED`;
- 403 → `ACCESS_NOT_ESTABLISHED`;
- 429 → `RATE_LIMITED_ACTIVE_UNKNOWN`;
- 5xx → `SOURCE_ERROR_ACTIVE_UNKNOWN`.

Em especial:

`401 != prova criptográfica de token inválido`.

Pode haver credencial inválida, não ativada, configuração divergente, política de acesso ou outra condição operacional. O ARCA preserva o fato observado — HTTP 401 — sem inventar a causa.

## Integração

O probe Portal agora exige antes de qualquer acesso:

- confirmação do GET;
- código do documento;
- token secreto;
- `ARCA_PORTAL_TOKEN_PROVENANCE=OFFICIAL_EMAIL_REGISTRATION`;
- `ARCA_PORTAL_TOKEN_RECEIVED_AT=<UTC ISO-8601>`;
- scope revisado;
- revisão Git válida;
- cofre privado válido.

Falha em qualquer item deve ocorrer antes do GET.

## Segurança

A prova sanitizada pode conter:

- fingerprint SHA-256;
- procedência declarada;
- data declarada de recebimento;
- estado de atividade;
- estado observado no request.

Não pode conter:

- token;
- código bruto do documento;
- corpo público da resposta;
- segredo do cofre.

## Próximo gate

Esta Fase D não executa o quarto GET.

Depois de integrada:

1. obter/confirmar um token pelo fluxo oficial;
2. registrar somente os metadados não secretos;
3. gerar o preview do escopo;
4. obter autorização humana explícita para um único GET;
5. executar o probe;
6. vincular status HTTP ao fingerprint da credencial;
7. se 2xx, seguir para M5-C e revisão do schema.

