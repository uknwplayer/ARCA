# ARCA — Portal Manifest Preview V0.1

Estado: **OFFLINE / MANIFESTO SANITIZADO / SEM REDE**.

Este passo existe para resolver o gate entre “escolher um documento real” e “autorizar um GET real”.

O workflow manual `.github/workflows/arca-portal-manifest-preview.yml` recebe o código do documento apenas por `ARCA_PORTAL_DOCUMENT_CODE` em GitHub Secrets e produz somente:

- revisão canônica;
- `scopeHash`;
- hash SHA-256 do código do documento;
- endpoint/fase fixos;
- budgets fixos;
- flags explícitas de rede/publicação desligadas.

Ele **não recebe** `ARCA_PORTAL_API_KEY`, passphrase de custódia, token do cofre ou repositório privado de custódia. Não existe transporte HTTP nesse passo.

Fluxo:

```text
código real em Secret
        ↓
manifest preview offline
        ↓
scope_sha256 sanitizado
        ↓
revisão humana
        ↓
autorização específica posterior
        ↓
workflow live M4
```

Executar o preview não autoriza o GET. O hash produzido deve ser revisado e então usado como `scope_sha256` no workflow live somente após autorização explícita separada.

Confirmação exigida no preview:

`PORTAL_MANIFEST_PREVIEW_ONLY`

A confirmação do workflow live continua diferente:

`PORTAL_DOCUMENT_GET_ONLY`
