# ARCA — Vince V4.1.1 Durable Control-Plane Challenge Consumption

Status: **IMPLEMENTAÇÃO CANDIDATA / HARDENING DO VERIFICADOR / SEM ALTERAR O WORKER TERMUX**.

## Problema

O Vince V4.1 já bloqueia replay dentro do mesmo processo, mas o verificador live histórico
criava um `new Set()` a cada execução. Uma segunda execução independente começava com
ledger vazio e poderia revalidar a mesma prova criptográfica.

Isso não significa que o worker executaria novamente. O problema está no plano de controle:
**a aceitação do challenge precisa sobreviver entre execuções do verificador**.

## V4.1.1

O V4.1.1 adiciona um registry durável:

`remote-jobs/v4.1/control/accepted-challenges.json`

na branch dedicada:

`vince-v41-termux-channel`

Cada entrada registra somente metadados de aceitação:

- hash SHA-256 do challenge de 32 bytes;
- mission id;
- request hash;
- result hash;
- proof hash;
- worker node id;
- fingerprint da chave pinada;
- instante de aceitação.

A chave privada do Termux continua fora do GitHub.

## Fluxo de aceitação

```text
request/result + pinned identity
        |
        v
load durable accepted-challenge registry
        |
        +--> challenge already present? -> FAIL CLOSED
        |
        v
cryptographic V4.1 verification
        |
        v
build next registry state
        |
        v
GitHub Contents API compare-and-swap
(current blob SHA is the precondition)
        |
        +--> conflict/stale SHA -> FAIL CLOSED
        |
        v
read back persisted registry
        |
        v
confirm exact challenge/proof entry
        |
        v
ATTESTED_VERIFIED_RESULT
```

A etapa criptográfica antes do commit produz apenas
`ATTESTATION_VALID_PENDING_DURABLE_CONSUMPTION`.
O status final só deve ser emitido depois de o estado persistido ser lido de volta e confirmado.

## Concorrência

O update do registry usa o SHA atual do blob como precondição. Duas execuções concorrentes
que lerem o mesmo estado não podem ambas atualizá-lo: após a primeira gravação, a segunda
fica com SHA obsoleto e o GitHub rejeita a escrita.

Para a criação inicial, a própria semântica de create-file do Contents API impede duas
criações simultâneas no mesmo caminho.

Isso é suficiente para o caminho one-shot atual; não é apresentado como consenso distribuído.

## Invariantes

- nenhum shell arbitrário é dado ao worker;
- nenhuma autoridade de merge/main é dada ao worker;
- nenhuma chave privada é publicada;
- Edge Steward continua congelado;
- Portal/PNCP não são acessados;
- replay é fail-closed;
- registry malformado é fail-closed;
- mission id não pode ser consumido duas vezes;
- confirmação final depende de persistência remota bem-sucedida.

## Prova histórica 006

A prova 006 já foi aceita antes da existência deste registry. A migração do V4.1.1 deve
registrar essa aceitação histórica no registry antes de usar o novo verificador contra ela.
Depois da migração, uma nova tentativa de verificar o mesmo challenge deve falhar com
`VINCE_V41_CHALLENGE_REPLAY`, sem executar novamente o worker Termux.
