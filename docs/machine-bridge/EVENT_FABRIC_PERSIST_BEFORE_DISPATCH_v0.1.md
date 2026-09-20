# Event Fabric Persist-Before-Dispatch v0.1

O Event Fabric aceita agora um store durável opcional. Quando presente, a ordem é obrigatória:

1. validar e calcular eventId;
2. verificar dedupe persistente;
3. persistir o evento;
4. somente depois convocar handlers.

Falha de persistência impede qualquer dispatch. Um novo processo conectado ao mesmo store reconhece eventos já persistidos e não os redispara como eventos novos.

Esta etapa garante registro antes da atuação, mas ainda não implementa recuperação de handlers que falharam depois da persistência. Isso exige estado de entrega/ack separado do evento imutável e será a próxima camada.
