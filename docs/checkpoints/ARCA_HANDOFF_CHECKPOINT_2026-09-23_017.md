# ARCA — Checkpoint 017: primeiro GET Portal alcançado, autenticação rejeitada

Data: **2026-09-22/23**

Estado: **PRIMEIRO GET PORTAL EXECUTADO; PREFLIGHT VERDE; PORTAL RESPONDEU UNAUTHORIZED; SEM CAPTURA/CUSTÓDIA VALIDADA**.

Autorização: issue #97, agora fechada/consumida.

Run live: `35802699058`.

Revisão auditada do probe: `3e05951fa543f359451208cf410705a0dcfb34e1`.

Scope SHA-256: `4a2c6b3809f6b17ae5ca5e94c965ef02e148a6fe31e429e889c71f97d183b8a3`.

## Resultado

- preflight de escopo: PASS;
- preflight do backend privado de custódia: PASS;
- código do documento e manifesto: MATCH;
- transporte controlado: executado;
- Portal: `ARCA_PORTAL_HTTP_UNAUTHORIZED`;
- artefato de captura validado: não produzido;
- correlação/classificação/publicação: não executadas;
- autorização one-shot #97: consumida e encerrada.

## Correção aplicada antes do GET

O adaptador one-shot inicialmente fixava o checkout da revisão auditada mas tentava sobrescrever `GITHUB_SHA` por YAML. O GitHub preservou o SHA do evento, causando `ARCA_PORTAL_SCOPE_HASH_MISMATCH`. A PR #99 corrigiu o adaptador para executar o probe com `GITHUB_SHA=$(git rev-parse HEAD)`, vinculando o manifesto à revisão realmente checkoutada. CI da PR e pós-merge ficaram verdes.

## Interpretação

`UNAUTHORIZED` é falha de autenticação da API, não evidência sobre o documento, órgão, fornecedor ou investigação. O ARCA não deve repetir o GET automaticamente.

## Próximo gate

1. validar/renovar a chave da API do Portal sem expô-la;
2. confirmar que o secret `ARCA_PORTAL_API_KEY` contém apenas o valor do token;
3. registrar uma nova autorização one-shot;
4. executar um novo preflight e no máximo um novo GET;
5. somente após resposta 2xx capturar bytes, cifrar, persistir no cofre e observar o schema real;
6. continuar sem correlação/classificação no primeiro sucesso live.

Work, Vince e Edge Steward permanecem fora do caminho crítico deste gate.
