# Event Fabric Durable Store v0.1

Store filesystem append-once para eventos do Event Fabric. Cada `eventId` SHA-256 possui um único arquivo, escrito primeiro em temporário com `wx`, fsync e rename atômico. O diretório de eventos recebe fsync quando suportado.

Reabrir o store preserva dedupe: o mesmo eventId retorna `duplicate`.

Esta camada só persiste eventos. Ela não autentica fontes remotas, não executa handlers e não concede autoridade. A integração do Event Fabric com este store deve persistir o evento antes do dispatch para permitir recuperação segura após reinício.
