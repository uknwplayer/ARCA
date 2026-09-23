# ARCA — Device Agent e Runtime Autônomo Local V0.1

Estado: **PLANEJADO / CONGELADO ATÉ SOLICITAÇÃO EXPLÍCITA DO USUÁRIO**.

## Decisão principal

Para o ambiente atual do operador, o caminho preferencial é o **ARCA Device Agent**.

Motivo:

- reaproveita o Android/Termux já existente;
- não exige executar um modelo grande localmente;
- permite que o ARCA ganhe braços operacionais no dispositivo sem depender de shell irrestrito;
- mantém o raciocínio pesado onde houver melhor capacidade computacional;
- pode evoluir por níveis de autoridade;
- é compatível com Vince, Machine Bridge, Atlas e replay protection já existentes.

## Device Agent — caminho preferencial

Fases futuras:

1. ARCA-only;
2. Termux allowlisted;
3. Device capabilities específicas.

Princípios obrigatórios:

- deny-by-default;
- capability catalog versionado;
- identidade criptográfica;
- challenge/replay protection;
- leases/expiração;
- revogação;
- watchdog;
- kill switch local;
- budgets de CPU/RAM/bateria/temperatura;
- logs auditáveis;
- atualização assinada;
- fallback para modo manual/one-shot.

## Runtime Autônomo Local

É uma possibilidade técnica separada.

Objetivo: executar localmente:

- modelo de linguagem;
- memória;
- scheduler;
- policies;
- ferramentas;
- Vince/orquestrador;
- ARCA Device Agent.

Isso pode criar independência operacional da nuvem.

### Limite conceitual

O Runtime Autônomo Local **não significa transferir a instância atual do ChatGPT para o dispositivo**.

Ele seria um runtime/modelo separado, possivelmente de pesos abertos, que poderia reutilizar:

- Atlas Técnico;
- documentação do ARCA;
- checkpoints;
- policies;
- protocolos;
- memória explicitamente exportável;
- ferramentas locais.

## Requisito de hardware

O Runtime Autônomo Local depende muito mais de hardware que o Device Agent.

Fatores críticos:

- RAM disponível;
- largura de banda de memória;
- CPU/GPU/NPU;
- armazenamento;
- dissipação térmica;
- consumo de energia;
- tamanho/quantização do modelo;
- janela de contexto.

Um telefone pode executar modelos pequenos/quantizados, mas modelos maiores podem ficar lentos, aquecer o aparelho ou pressionar RAM/bateria.

## PocketPal como fallback local

PocketPal pode ser útil como:

- IA offline de emergência;
- bancada para testar modelos GGUF;
- benchmark de tokens/s e memória;
- comparação de quantizações;
- validação prática de quais modelos cabem no dispositivo;
- fallback manual quando internet/serviços em nuvem estiverem indisponíveis.

PocketPal **não é dependência do ARCA**.

No estado atual, deve ser tratado como ferramenta auxiliar/manual. Integração automática com o ARCA exigiria uma interface de servidor/API local adequada ou um adaptador/fork próprio.

## Regra de congelamento

- Device Agent: planejado, mas congelado enquanto o núcleo ARCA for prioridade.
- Runtime Autônomo Local: **congelado até solicitação explícita do usuário**, mesmo após o ARCA estar funcional.
- PocketPal: pode ser usado manualmente pelo operador a qualquer momento, mas não entra na arquitetura operacional do ARCA sem decisão específica.

