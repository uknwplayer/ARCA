# @arca/acquisition 0.3.0

Adaptador local de aquisição e cadeia de custódia. Preserva bytes originais, calcula SHA-256 real, registra transformações/revisões e produz proposta de `DOC` sem escrever no Core.

## Uso mínimo

```bash
node packages/acquisition/bin/arca-acquire.mjs capture \
  --home .arca-workbench \
  --allowed-root /dados/autorizados \
  --investigation INV-000001 \
  --acquisition ACQ-000001 \
  --source-id SRC-000001 \
  --source /dados/autorizados/documento.pdf \
  --title "Documento público" \
  --locator "https://origem.example/documento.pdf" \
  --accessed-at "2026-09-14T12:00:00Z" \
  --method manual-import \
  --basis public \
  --declaration "Documento disponibilizado publicamente pela origem." \
  --actor operador@example
```

Verifique depois com `verify`. Registre derivados com `transform`, decisão humana com `review` e intenção ainda não executada com `enqueue`.

O pacote não baixa URLs, não administra credenciais, não contorna acesso e não transforma documento em evidência. Leia `docs/ARCA_ACQUISITION_CUSTODY_SPEC_v0.3.0.md`.
