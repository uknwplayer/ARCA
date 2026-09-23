# ARCA — Checkpoint 027: Vince V4.1 Candidate Attestation Verifier

Data: **2026-09-23**.

Estado: **VINCE V4 LIVE-PROVEN LIMITADO; V4.1 VERIFIER CANDIDATO INTEGRADO E TESTADO OFFLINE; CONTRATO REMOTO REPLIT AINDA NÃO RECONCILIADO POR COTA; NENHUMA CHAVE PRIVADA PROVISIONADA**.

Main de entrada: `7f802cdb6ece89b525a724bdc0ce9ec3dc0e802d`.

PR de implementação V4.1 verifier: #127.

CI da PR: `35826141926` — success.

CI pós-merge: `35826260790` — success.

Documento: [ARCA_VINCE_V4_1_CANDIDATE_ATTESTATION_VERIFIER.md](../ARCA_VINCE_V4_1_CANDIDATE_ATTESTATION_VERIFIER.md).

Gate normativo: [ARCA_VINCE_V4_1_REMOTE_ATTESTATION_GATE.md](../ARCA_VINCE_V4_1_REMOTE_ATTESTATION_GATE.md).

## Situação do Replit

O app Replit concluiu uma etapa de implementação antes de atingir a cota diária gratuita.

A inspeção seguinte foi bloqueada pelo próprio Replit com:

`You've reached your daily free quota limit. It will reset at 12:00 AM UTC.`

Portanto:

- não classificar isso como falha do ARCA;
- não assumir detalhes do contrato remoto que não foram inspecionados;
- não provisionar nem gerar private key por inferência;
- não executar V4.1 live até reconciliação.

## Estado confirmado antes do bloqueio

V4 permanece válido pelo checkpoint 026:

- missão `vince-v4-live-005`;
- GitHub/ARCA → Replit → GitHub;
- `git-status` allowlisted;
- request/result hashes verificados;
- proof `daea9c2c…`;
- `cryptographicWorkerAttestation=false`.

## Entrega V4.1 offline

O ARCA agora possui um verifier candidato que exige:

- schema V4.1 dedicado;
- challenge base64url de exatamente 32 bytes;
- `git-status` como única ação;
- expiration;
- canonical request/result SHA-256;
- Ed25519;
- identidade pública com nodeId/SPKI/fingerprint;
- fingerprint recomputado do SPKI;
- identidade previamente pinada;
- assinatura sobre domínio candidato fixo + payload canônico;
- replay ledger externo;
- rejeição de challenge repetido;
- rejeição de chave válida mas não pinada;
- rejeição de tampering em challenge, provenance, stdout ou hashes.

O challenge só é consumido depois de assinatura, correlação e política válidas.

## Autoridade

Mesmo um futuro resultado válido mantém:

- `automaticRetryPerformed=false`;
- `failoverAuthorized=false`;
- `authorityExpanded=false`;
- `coreMutationPerformed=false`;
- `trustModified=false`.

## Contrato candidato

O lado ARCA usa provisoriamente:

- request: `arca-vince-v4.1-job`;
- result: `arca-vince-v4.1-result`;
- protocol version: `"4.1"`;
- domínio: `ARCA-VINCE-V4.1-REMOTE-ATTESTATION`;
- canonicalização JSON lexicográfica compatível com V4.

Esses valores **não são considerados contrato live final** até serem comparados com o worker Replit já implementado.

## Próximo gate quando a cota Replit retornar

Inspecionar sem modificar:

1. schema request/result real;
2. canonicalização exata;
3. domínio de assinatura;
4. campos cobertos pela assinatura;
5. comandos one-shot/inspeção pública;
6. comportamento quando `ARCA_V41_ED25519_PRIVATE_KEY` está ausente;
7. representação da public key/fingerprint.

Não pedir, revelar ou gerar private key nessa inspeção.

Se houver divergência, reconciliar por PR antes de qualquer prova live.

Depois:

- provisionar uma identidade persistente somente por fluxo seguro do Replit;
- revisar/pinar a identidade pública no ARCA;
- criar fresh challenge;
- registrar nova issue one-shot;
- executar um único `git-status`;
- verificar assinatura e replay;
- registrar V4.1 live proof.

## Outros gates

Portal continua sem quarto GET autorizado.

Edge Steward continua congelado.
