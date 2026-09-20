# Event Fabric Delivery Dispatch v0.1

Integra Event Fabric e Delivery Ledger.

Para handlers identificados, a ordem é: evento já persistido -> claim durável adquirido -> handler -> ACK durável. Exceção gera failed, nunca ACK.

O Fabric só executa o handler quando o claim atual foi efetivamente adquirido pelo chamador. Um ledger pode retornar `status: claimed` para um registro já existente; nesse caso `acquired: false` transforma a entrega em `uncertain` e o handler não é chamado.

Se o ledger já reporta ACK, o Fabric trata a entrega como concluída. Estados `claimed` não adquiridos, `failed` ou outros estados não-ACK não são redisparados automaticamente. Isso evita duplicação baseada apenas em timeout, crash, concorrência ou falha.

Handlers legados em forma de função continuam suportados com id determinístico por tipo/índice, mas handlers operacionais devem usar `{id, handle}` estável.

Recuperação/retry exigirá política explícita e evidência de idempotência do handler.
