# Event Fabric Recovery View v0.1

Camada observacional para inspecionar trabalho após restart/falha.

Ela não executa retry. Classifica por handler:
- sem delivery: elegível apenas para primeiro claim;
- acked: concluído;
- claimed: incerto, exige revisão/política;
- failed: falha incerta, exige revisão humana ou política que prove idempotência;
- estado desconhecido: fail closed.

A ausência de ACK não é prova de não-execução. Esta view existe para um futuro dispatcher/recovery controller tomar decisões explícitas sem reinterpretar silêncio como autorização.
