# ARCA — Vince V5 Termux A/B Routing V0.1

Status: **CANDIDATO / TESTE LÓGICO A/B / SEM DAEMON / SEM WORK / SEM REPLIT**.

## Objetivo

Testar o Vince com dois workers independentes do ponto de vista criptográfico, usando o Android/Termux já disponível.

```text
ARCA / Vince
   |
   +--> worker A — identidade Ed25519 A
   |
   +--> worker B — identidade Ed25519 B
```

Os dois podem existir no mesmo aparelho usando diretórios de identidade diferentes. Isso prova separação lógica de worker, identidade, presença e roteamento. **Não prova tolerância à perda física do aparelho**, porque A e B ainda compartilham o mesmo telefone.

## Regra de dependência

- Replit: somente evidência histórica; não é dependência operacional e não participa deste gate.
- ChatGPT Work: endpoint opcional; não participa deste gate.
- GitHub Actions: pode validar CI, mas não é executor do teste A/B.
- GitHub: permanece como transporte/registro do canal.
- Termux: executor sob controle do Criador.

## Presença assinada

Cada worker publica uma lease append-only em:

`remote-jobs/v5/presence/<nodeId>/<timestamp>-<hash>.json`

Estados:

- `READY`: identidade assinou disponibilidade temporária para `git-status`;
- `WITHDRAWN`: identidade retirou-se explicitamente da seleção.

A presença contém:

- nodeId;
- fingerprint Ed25519;
- SPKI pública;
- estado;
- intervalo de validade;
- capability;
- hash canônico;
- assinatura.

A private key continua apenas no Termux.

## Seleção

O Vince somente considera rota elegível quando:

1. o worker possui pin explícito;
2. identidade e fingerprint batem com o pin;
3. hash canônico confere;
4. assinatura Ed25519 confere;
5. presença não está no futuro além do skew;
6. presença não expirou;
7. estado é `READY`.

O resultado continua com `dispatchPerformed:false`. O primeiro gate prova seleção, não execução.

## Teste A/B planejado

Fase 1:

1. A publica `READY`;
2. B publica `READY`;
3. Vince observa ambos;
4. a presença válida mais recente vence;
5. nenhum job é disparado.

Fase 2:

1. A publica `WITHDRAWN`;
2. B permanece `READY`;
3. Vince deve selecionar B;
4. nenhuma missão é duplicada.

Depois disso poderá existir um gate separado para despacho real one-shot de `git-status` ao selecionado.

## Diretórios sugeridos no Android

Preservar o worker já live-proven como A:

`~/.arca/vince-v41`

Criar B separadamente:

`~/.arca/vince-v41-b`

Cada diretório possui private key e ledger próprios.

## Limites

Este marco não:

- cria daemon;
- reativa Edge Steward;
- prova failover de aparelho;
- concede shell;
- concede merge/main;
- usa Work;
- usa Replit;
- usa Actions como executor;
- executa Portal/PNCP;
- altera trust automaticamente.
