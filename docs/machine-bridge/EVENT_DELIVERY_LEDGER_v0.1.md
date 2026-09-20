# Event Delivery Ledger v0.1

Separa a existência imutável do evento do estado de entrega para cada handler.

Estados iniciais: `claimed`, `acked`, `failed`.

`acked` significa que aquele handler concluiu sua responsabilidade. `failed` não é ACK e não autoriza inferir que nenhuma ação ocorreu. Cada handler possui estado independente para o mesmo eventId.

O ledger persiste em filesystem e sobrevive à recriação do processo. Esta versão não implementa lease/expiração/reclaim automático: um claim órfão deve permanecer incerto até uma política explícita de recuperação, evitando execução duplicada por timeout.

## Claim ownership

A primeira criação do claim usa abertura exclusiva de arquivo (`wx`). Apenas o chamador que criou o registro recebe `acquired: true`.

Se outro processo ou outra instância observar um claim já existente, recebe o mesmo estado persistido com `acquired: false`. Portanto, observar `status: claimed` não significa possuir autorização para executar o handler.

Falha ao persistir o claim ocorre antes da chamada do handler. Um claim já existente nunca é sobrescrito como forma de adquirir ownership.

## Regra de segurança

`timeout != proof of non-execution`

e

`existing claim != permission to execute`

Claims `claimed`/órfãos e deliveries `failed` continuam exigindo recuperação explícita. Não há retry automático.
