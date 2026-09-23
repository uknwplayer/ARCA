# ARCA — M5 Fase E: Binding do preflight ao probe live V0.1

Estado: **IMPLEMENTAÇÃO CANDIDATA / OFFLINE / SEM QUARTO GET**.

Issue: #172.

## Objetivo

Impedir que uma autorização humana para o próximo probe seja reutilizada depois de qualquer mudança material no estado revisado.

A Fase E vincula o probe live a três hashes explícitos:

- `scope_sha256`;
- `preflight_sha256`;
- `credential_fingerprint_sha256`.

## Gate 040 como atestação

O preflight isolado passa a produzir um digest determinístico:

`preflightSha256`.

Esse digest cobre somente material sanitizado:

- revisão Git;
- scope hash;
- hash do código do documento;
- fingerprint da credencial;
- proveniência declarada da credencial;
- instante declarado de recebimento;
- hash do repositório de custódia;
- branch da custódia;
- flags fail-closed do preflight.

Não entram:

- token;
- código bruto do documento;
- passphrase;
- token do cofre;
- corpo de resposta.

## Binding no probe live

Antes de criar o transporte HTTP, o probe live:

1. valida confirmação explícita;
2. deriva o scope atual;
3. calcula a prontidão/fingerprint da credencial atual;
4. executa apenas o preflight do cofre;
5. reconstrói a atestação do Gate 040;
6. compara `preflight_sha256`;
7. compara `credential_fingerprint_sha256`;
8. somente se tudo for idêntico cria o transporte Portal.

Portanto:

```text
mudou revisão
ou documento
ou token
ou cofre
ou branch do cofre
        ↓
digest diverge
        ↓
FAIL CLOSED
        ↓
0 request Portal
```

## Workflow live

O workflow manual do Portal passa a exigir:

- `confirmation`;
- `scope_sha256`;
- `preflight_sha256`;
- `credential_fingerprint_sha256`;
- `token_provenance`;
- `token_received_at`.

O workflow continua `workflow_dispatch` somente.

A Fase E não transforma o preflight em autorização de rede. A autorização humana específica para um GET continua obrigatória.

## Prova na captura

Se um GET vier a ser autorizado futuramente, a prova custodial carregará `authorizationBinding` com:

- `preflightSha256`;
- `credentialFingerprintSha256`;
- `scopeHash`;
- `revision`.

Isso permite demonstrar qual estado exato foi revisado antes da captura.

## Reexecução

`retries=0`.

Um mismatch nunca autoriza retry automático. É necessário produzir/revisar novo preflight e obter nova autorização humana.

## Limite atual

Esta implementação não executa o Portal.

O Gate 040 ainda precisa de uma prova operacional com os secrets reais. Depois dela, os hashes sanitizados poderão alimentar o workflow live, mas o quarto GET continua dependendo de autorização explícita separada.
