# ARCA — Vince Recovery Signed Identity V0.4

Status: **IMPLEMENTAÇÃO CANDIDATA / HARDENING V3.2 / SEM NOVA EXECUÇÃO LIVE**.

## Objetivo

V0.4 vincula a prova de recovery do Vince a dois mecanismos já canônicos do Machine Bridge:

1. `ExecutionIdentityStore` create-only;
2. identidade Mesh Ed25519 e trust store explícito.

O objetivo é impedir que um checkpoint/recovery válido seja tratado apenas como um conjunto solto de hashes.

## Ponte Python → Machine Bridge

A entrada é o par produzido pelo Vince V0.3:

- `arca.vince-recovery-checkpoint.v0.3`;
- `arca.vince-recovery-proof.v0.3`.

Antes de qualquer persistência, o lado JavaScript recalcula independentemente:

- `checkpoint_record_sha256`;
- `job_fingerprint`;
- `mission_sha256`;
- `proof_sha256`.

Isso cria uma verificação cruzada entre implementações diferentes.

## Execution Identity

O recovery verificado gera uma identidade determinística com:

- `logicalRequestId = mission_id`;
- `roleId = vince.recovery`;
- Role Contract hash fixando:
  - recovery somente de DispatchRef existente;
  - nenhum `submit()` durante recovery;
  - incerteza nunca autoriza retry;
  - incerteza nunca autoriza failover;
  - somente resultado original verificado pode concluir recovery;
- authorization binding hash fixando:
  - public-only;
  - sem secrets;
  - sem retry automático;
  - sem failover por incerteza;
  - sem core mutation;
  - sem trust modification;
  - revisão humana obrigatória;
- `idempotencyClass = synthetic`.

## Attempt

A tentativa create-only vincula:

- executor;
- provider family;
- execution domain;
- job fingerprint;
- DispatchRef;
- checkpoint hash;
- recovery proof hash;
- owner binding derivado do executor + DispatchRef.

A conclusão da tentativa aceita somente o `result_sha256` já verificado pelo Vince V0.3.

Replay idêntico reutiliza a mesma identidade/tentativa/conclusão. Drift falha fechado.

## Signed Recovery Receipt

Formato:

`arca-vince-recovery-receipt-v0.4`

Domínio Mesh:

`arca.mesh.vince-recovery-receipt.v1`

O recibo assinado vincula:

- execution ID/hash;
- attempt ID/hash;
- completion hash;
- mission ID/hash;
- checkpoint hash;
- DispatchRef;
- result hash;
- accepted receipt hash;
- recovery proof hash;
- `RECOVERED_VERIFIED_RESULT`;
- zero redispatch;
- zero retry automático;
- zero failover;
- zero duplicação;
- zero expansão de autoridade.

## Signer Broker

O `Secure Mesh Signer Broker V1` recebe uma nova operação fechada:

`signVinceRecoveryReceipt(...)`

A chave privada continua acessível apenas via `vault://` dentro de `withCredential()`.

Nenhum método genérico de assinatura é exposto.

## Limites

V0.4 não cria uma identidade persistente live por conta própria.

Para uma prova live assinada é necessário um Mesh signer operacional persistente com:

- identidade pública conhecida;
- private key Ed25519 no Credential Vault;
- trust pinning explícito;
- política de rotação.

Sem esse signer persistente, usar chave efêmera em CI serve apenas como teste criptográfico, não como prova de identidade operacional contínua.

V0.4 não autoriza V4, Edge Steward, retry, failover pós-aceitação ou expansão de trust.
