# ARCA — Checkpoint 028: Vince V4.1 Termux Worker One-Shot

Data: **2026-09-23**.

Estado: **WORKER TERMUX V4.1 CANÔNICO; CI VERDE; CANAL DEDICADO CRIADO; LIVE PROBE #130 AGUARDA IDENTIDADE PÚBLICA DO CELULAR; EDGE STEWARD CONTINUA CONGELADO**.

Main de entrada: `a2d08933a3795abba0f66b1905d028680ae12290`.

PR de implementação: #129.

CI da PR: `35827384616` — success.

CI pós-merge: `35827476094` — success.

Canal dedicado: branch `vince-v41-termux-channel`.

Live probe pré-registrado: issue #130.

Documento: [ARCA_VINCE_V4_1_TERMUX_WORKER_V0_1.md](../ARCA_VINCE_V4_1_TERMUX_WORKER_V0_1.md).

## O que entrou

O ARCA agora possui um worker V4.1 one-shot para Android/Termux que:

- aceita somente `git-status`;
- não usa shell arbitrário;
- valida schema, expiração e challenge de 32 bytes;
- gera/usa identidade Ed25519 local;
- mantém private key somente no dispositivo;
- publica somente identidade pública;
- registra ledger local de challenge;
- assina o resultado;
- publica exatamente um result no canal dedicado;
- encerra após uma única missão;
- não possui modo daemon/serviço/loop.

O verifier V4.1 passou a aceitar provenance `termux-android` sem quebrar o caminho Replit.

## Identidade

A identidade local é criada somente quando o usuário executar explicitamente:

`node scripts/arca-vince-v41-termux.mjs init-identity`

O material privado fica em:

`~/.arca/vince-v41/ed25519-private.pem`

com permissão 0600.

A private key não é impressa e não deve ser enviada ao chat/GitHub.

A identidade pública pode ser publicada pelo próprio worker com:

`node scripts/arca-vince-v41-termux.mjs publish-identity`

Destino:

`remote-jobs/v4.1/identities/<nodeId>.json`

na branch `vince-v41-termux-channel`.

## Gate live #130

Nenhuma request live foi publicada ainda.

A sequência obrigatória é:

1. `doctor`;
2. `init-identity`;
3. `publish-identity`;
4. ARCA revisa e pina a identidade pública;
5. ARCA cria challenge fresco e request one-shot;
6. usuário executa `once --job-id ...`;
7. ARCA verifica assinatura, hashes, pinning e replay;
8. registrar prova final.

## Limites

Esta implementação:

- não reativa o Edge Steward;
- não roda 24/7;
- não acessa Portal/PNCP;
- não possui retry/failover;
- não ganha trust/core/main/merge authority;
- não depende da cota do Replit Agent.

## Próximo passo humano mínimo

No Termux, dentro de um clone atualizado do ARCA:

```bash
node scripts/arca-vince-v41-termux.mjs doctor
node scripts/arca-vince-v41-termux.mjs init-identity
node scripts/arca-vince-v41-termux.mjs publish-identity
```

Depois disso o restante da preparação do live probe volta a ser conduzido pelo GitHub/ARCA.

Portal continua sem quarto GET autorizado.
