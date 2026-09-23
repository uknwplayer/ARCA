# ARCA — Vince V4.1 Termux Worker One-Shot V0.1

Status: **IMPLEMENTAÇÃO CANDIDATA / NÃO É EDGE STEWARD / SEM EXECUÇÃO LIVE AINDA**.

## Objetivo

Permitir que um Android com Termux funcione como um worker V4.1 independente e efêmero:

```text
ARCA / GitHub
   |
   v
request V4.1 com challenge
   |
   v
Termux one-shot
   |
   +--> valida request / expiração / challenge
   +--> executa somente git-status, sem shell
   +--> assina resultado com Ed25519 local
   +--> publica resultado no canal dedicado
   |
   v
processo encerra
```

Não existe modo daemon, serviço, loop ou 24/7 nesta implementação.

## Dependências locais

- Termux;
- Node.js;
- Git;
- GitHub CLI `gh`;
- `gh auth login` válido para a conta que pode escrever no canal dedicado.

O worker não recebe token por payload. A autenticação GitHub permanece no `gh` local do Termux.

## Identidade

O comando `init-identity`:

- gera Ed25519 no próprio dispositivo;
- grava private key em `~/.arca/vince-v41/ed25519-private.pem`;
- usa permissão `0600`;
- cria identidade pública com nodeId, SPKI DER em base64 e SHA-256 fingerprint;
- cria ledger local de challenges usados;
- recusa sobrescrever identidade existente.

A private key:

- nunca é impressa;
- nunca é enviada ao GitHub;
- nunca entra no resultado;
- nunca entra no chat;
- nunca é armazenada no repositório.

## Publicação da identidade

`publish-identity` publica apenas:

- formato/protocolo;
- worker kind = `termux-android`;
- nodeId;
- algoritmo `Ed25519`;
- publicKeySpki;
- keyFingerprint.

Destino padrão:

`uknwplayer/ARCA@vince-v41-termux-channel`

Caminho:

`remote-jobs/v4.1/identities/<nodeId>.json`

Depois disso, a identidade pública precisa ser revisada e pinada pelo ARCA antes de qualquer missão live.

## One-shot

`once --job-id <id>`:

1. lê exatamente uma request em `remote-jobs/v4.1/requests/<jobId>.json`;
2. exige `arca-vince-v4.1-job`;
3. exige `protocolVersion = "4.1"`;
4. exige `git-status`;
5. valida expiração e challenge de 32 bytes;
6. recusa challenge já usado localmente;
7. executa Git diretamente com argumentos, sem shell;
8. coleta branch, HEAD, dirty state e stdout/stderr limitados;
9. produz `resultSha256` canônico;
10. assina o payload com Ed25519;
11. publica exatamente um result em `remote-jobs/v4.1/results/<jobId>.json`;
12. grava o challenge no ledger local;
13. encerra o processo.

Não há retry automático nem fallback.

## Autoridade

O worker não possui:

- shell arbitrário;
- merge;
- `main.write` por contrato;
- trust modification;
- Core mutation;
- Portal/PNCP;
- execução investigativa;
- daemon;
- background service.

O canal deve usar branch dedicada e nunca a `main`.

## Comandos

A partir de um clone local do ARCA:

```bash
node scripts/arca-vince-v41-termux.mjs doctor
node scripts/arca-vince-v41-termux.mjs init-identity
node scripts/arca-vince-v41-termux.mjs show-identity
node scripts/arca-vince-v41-termux.mjs publish-identity
```

A execução live `once` só deve ocorrer depois de o ARCA revisar e pinar a identidade pública e publicar uma request one-shot fresca.

## Stop conditions

Parar sem executar se:

- `doctor` falhar;
- identidade já existir de forma inesperada;
- fingerprint/SPKI divergirem da private key;
- request estiver expirada;
- challenge já tiver sido usado;
- action não for `git-status`;
- jobId não for seguro;
- git repo local não tiver HEAD/branch válidos;
- stdout/stderr excederem orçamento;
- resultado remoto com o mesmo jobId já existir;
- publicação GitHub falhar.

## Interpretação futura

Se uma missão live passar, ela provará:

**ARCA/GitHub → Android/Termux → assinatura Ed25519 local → GitHub → verificação pinada.**

Isso não reativa o Edge Steward. É um worker one-shot operado explicitamente pelo usuário.
