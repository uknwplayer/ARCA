# ARCA — Checkpoint 032: Vince V5 Termux A/B Foundation

Data: **2026-09-23**.

Estado: **VINCE V5 TERMUX A/B INTEGRADO E TESTADO; PROVA LIVE A/B PENDENTE; WORK OPCIONAL; REPLIT SOMENTE HISTÓRICO; EDGE STEWARD CONGELADO**.

## Âncoras

- PR: #144 — `feat(vince): add quota-independent Termux A/B routing`
- commit canônico: `49b7afb348ad651829d593203de35715d27e7758`
- CI da PR: `35839970387` — success
- CI pós-merge: `35840109710` — success
- Probe live pré-registrado: issue #143
- worker A live-proven preservado: `vince-termux-android-1`
- pin A: `config/vince-v4.1/trusted-workers/vince-termux-android-1.json`
- canal: `vince-v41-termux-channel`

## O que foi integrado

A PR #144 acrescentou:

- `executionReady` como condição V5 genérica de disponibilidade verificada, sem depender semanticamente de ACK do Work;
- lease Termux V5 assinada por Ed25519;
- estados de presença `READY` e `WITHDRAWN`;
- validação fail-closed de pin, SPKI, fingerprint, hash canônico, assinatura, tempo e freshness;
- armazenamento append-only das presenças em `remote-jobs/v5/presence/<nodeId>/...`;
- seleção de rota entre workers Termux;
- `dispatchPerformed:false` durante este gate;
- CLI `scripts/arca-vince-v5-termux-ab.mjs`;
- testes de presença válida, preferência pela evidência mais recente, retirada A→B, lease expirada e pin mismatch;
- documentação do limite: dois workers no mesmo Android provam isolamento lógico, não resiliência física do dispositivo.

## Decisão de dependência

Replit não é mais dependência operacional do Vince. A prova V4 GitHub↔Replit permanece somente como evidência histórica.

ChatGPT Work permanece endpoint opcional. Indisponibilidade ou cota do Work não bloqueia o Vince.

GitHub Actions pode validar CI, mas não é o executor necessário do Probe 010. O teste operacional usa Termux e GitHub como transporte/registro.

## Próximo gate — Probe 010

Não alterar a identidade A já provada.

Criar uma segunda identidade no Termux em diretório separado:

```bash
cd ~/ARCA
git pull --ff-only

node scripts/arca-vince-v41-termux.mjs init-identity \
  --node-id vince-termux-android-2 \
  --identity-dir ~/.arca/vince-v41-b

node scripts/arca-vince-v41-termux.mjs publish-identity \
  --identity-dir ~/.arca/vince-v41-b
```

Depois da publicação:

1. revisar a identidade pública B no canal;
2. criar pin explícito para B em PR separada;
3. integrar o pin após CI;
4. A publica `READY`;
5. B publica `READY`;
6. Vince verifica ambos e seleciona uma rota, sem dispatch;
7. A publica `WITHDRAWN`;
8. B publica nova `READY`;
9. Vince deve selecionar B;
10. registrar hashes, fingerprints e prova do Probe 010.

## O que o Probe 010 ainda não prova

Mesmo que passe:

- não existe daemon;
- não existe serviço 24/7;
- não existe failover físico de aparelho;
- nenhum job foi despachado nesta fase;
- nenhum shell arbitrário foi concedido;
- nenhuma autoridade de merge/main/trust foi concedida;
- Edge Steward continua congelado;
- Portal/PNCP não participa.

## Gate posterior

Somente depois de a seleção A/B live ser provada:

`rota selecionada → request one-shot git-status → resultado Ed25519 → verificação V4.1.1 → consumo durável → nenhuma duplicação`.

Esse gate posterior deve continuar limitado a `git-status` até nova decisão explícita.
