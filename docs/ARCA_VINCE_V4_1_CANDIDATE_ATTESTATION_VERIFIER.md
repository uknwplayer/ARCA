# ARCA — Vince V4.1 Candidate Attestation Verifier

Status: **IMPLEMENTAÇÃO CANDIDATA OFFLINE / CONTRATO REPLIT AINDA NÃO RECONCILIADO**.

## Contexto

O V4 live proof 005 já provou transporte, execução e retorno heterogêneos entre ARCA/GitHub e Replit, porém com:

`cryptographicWorkerAttestation=false`

O gate V4.1 exige identidade Ed25519 persistente do worker, challenge one-shot, assinatura e trust pinning explícito.

A cota diária do Replit impediu a inspeção final do contrato remoto após a implementação no app. Portanto este módulo é deliberadamente um **candidato do lado ARCA** e não deve ser usado para declarar uma prova live até a reconciliação com o worker real.

## Contrato candidato ARCA

Request:

- `format = arca-vince-v4.1-job`
- `protocolVersion = "4.1"`
- job id prefixado por `vince-v41-`
- `action = git-status`
- expiration ISO-8601
- challenge base64url de exatamente 32 bytes

Result:

- `format = arca-vince-v4.1-result`
- `protocolVersion = "4.1"`
- correlação exata de job/action/challenge
- request SHA-256 canônico
- result SHA-256 canônico
- timestamps/status/exit code
- stdout/stderr limitados e não truncados
- Git branch/HEAD/dirty
- identidade do worker:
  - nodeId
  - algorithm = Ed25519
  - SPKI DER em base64
  - SHA-256 fingerprint do SPKI
- signature Ed25519 base64url

## Canonicalização candidata

Mesma regra já usada no V4:

- objetos ordenados lexicograficamente por chave;
- arrays preservam ordem;
- JSON compacto;
- UTF-8;
- sem newline.

`resultSha256` cobre o resultado sem `resultSha256` e sem `signature`.

A assinatura cobre o payload com `resultSha256`, mas sem `signature`.

## Domínio candidato

`ARCA-VINCE-V4.1-REMOTE-ATTESTATION\0<canonical-payload>`

O domínio só será promovido a canônico após comparação com o contrato remoto do Replit.

## Trust pinning

O verifier exige uma identidade previamente revisada e pinada com:

- nodeId exato;
- keyFingerprint exato;
- publicKeySpki exato.

Uma assinatura válida de chave não pinada é rejeitada.

Não existe trust-on-first-use.

## Replay

O verifier exige um challenge ledger externo e rejeita challenge já aceito.

O challenge só é marcado como usado após:

1. schema/hashes/correlação válidos;
2. identidade pinada;
3. assinatura Ed25519 válida;
4. execução `git-status` bem-sucedida.

## Autoridade

Mesmo um resultado V4.1 aceito registra:

- `automaticRetryPerformed=false`
- `failoverAuthorized=false`
- `authorityExpanded=false`
- `coreMutationPerformed=false`
- `trustModified=false`

V4.1 não amplia allowlist, shell, merge ou investigação.

## Gate antes de qualquer live V4.1

Quando a cota Replit estiver disponível:

1. inspecionar o contrato remoto já implementado sem alterar nada;
2. confirmar comportamento quando `ARCA_V41_ED25519_PRIVATE_KEY` estiver ausente;
3. não gerar nem expor private key;
4. comparar schema, canonicalização e domínio de assinatura com este candidato;
5. alterar o lado ARCA ou remoto somente por PR/revisão explícita se houver divergência;
6. revisar/pinar a identidade pública;
7. somente então registrar e executar uma missão one-shot V4.1.

Até esse gate, V4.1 permanece offline.
