# ARCA — Checkpoint 024: Vince Recovery Signed Identity V0.4

Data: **2026-09-23**.

Estado: **VINCE V0.4 CANÔNICO; V3.2 HARDENING CRIPTOGRÁFICO TESTADO OFFLINE; EXECUTION IDENTITY + MESH SIGNED RECEIPT INTEGRADOS; LIVE SIGNER PERSISTENTE AINDA NÃO PROVADO**.

Main de entrada: `14be99ead33e620e47b1dbe14d5c0792942c6881`.

PR de implementação: #118.

CI final da PR: `35811942932` — success.

CI pós-merge: `35812109997` — success.

Documento: [ARCA_VINCE_RECOVERY_SIGNED_IDENTITY_V0_4.md](../ARCA_VINCE_RECOVERY_SIGNED_IDENTITY_V0_4.md).

## Resultado

V3.2 liga o recovery V0.3 do Vince à infraestrutura canônica do Machine Bridge:

1. recebe checkpoint e proof V0.3;
2. recalcula independentemente:
   - checkpoint SHA-256;
   - job fingerprint;
   - mission SHA-256;
   - recovery proof SHA-256;
3. deriva um Role Contract fixo `vince.recovery`;
4. cria/reutiliza uma `ExecutionIdentity` determinística;
5. cria uma tentativa append-only vinculada ao executor, provider, execution domain, job fingerprint e DispatchRef;
6. marca a tentativa como concluída somente pelo result hash já verificado;
7. cria um recibo `arca-vince-recovery-receipt-v0.4`;
8. assina esse recibo no domínio Mesh dedicado `arca.mesh.vince-recovery-receipt.v1`;
9. verifica assinatura e trust pinning;
10. mantém retry, failover, core mutation e trust expansion desligados.

## Signer Broker

O Secure Mesh Signer Broker ganhou uma operação fechada:

`signVinceRecoveryReceipt(...)`

O broker continua sem método genérico de assinatura. A private key continua restrita ao Credential Vault durante a operação.

## Segurança

V0.4 fixa no contrato:

- recovery somente de DispatchRef existente;
- nenhum `submit()` durante recovery;
- incerteza não autoriza retry;
- incerteza não autoriza failover;
- public-only;
- sem secrets;
- sem core mutation;
- sem trust modification;
- human review required.

Drift no checkpoint, missão, job, proof, participant binding ou result hash falha fechado.

## Natureza da prova

Esta etapa é **offline/testada em CI**.

Os testes usam identidade Ed25519 de fixture/CI para provar:

- assinatura;
- domínio;
- trust pinning;
- isolamento da private key no broker;
- replay idempotente da Execution Identity;
- rejeição de tampering.

Não declarar ainda uma identidade Vince operacional persistente em produção/live. Isso exige uma Mesh identity persistente cuja private key esteja no Credential Vault e cuja identidade pública esteja explicitamente pinada.

## Próximo gate

Próximo marco funcional: **V4 — rota entre ambientes independentes**.

Antes ou junto de V4, pode-se fazer uma prova V3.2-live somente quando existir signer persistente adequado. Não gerar uma chave efêmera e apresentá-la como identidade operacional.

## Núcleo investigativo

Portal continua sem quarto GET autorizado. Edge Steward continua congelado.
