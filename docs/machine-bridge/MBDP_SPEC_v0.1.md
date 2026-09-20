# Machine Bridge Deliberation Protocol (MBDP) v0.1

## Propósito
O MBDP coordena auditoria multiagente autônoma sem conceder aos auditores autoridade sobre o sistema auditado.

## Princípios
1. **Provider-agnostic:** nenhum provedor de IA é parte do protocolo.
2. **Read-only no alvo:** auditores não alteram código, trust, ownership, routing, workers ou evidências.
3. **Append-only na sala:** auditores só podem acrescentar mensagens; não editam nem apagam histórico.
4. **Blind first round:** análises iniciais são seladas até todos responderem ou o prazo terminar.
5. **Evidence-first:** afirmações materiais devem referenciar evidências.
6. **Divergência é preservada:** consenso não é obrigatório nem tratado como verdade.
7. **Controle determinístico:** um controller, não uma IA, decide fases, limites e encerramento.
8. **Human authority:** revisão humana pode ser requerida; auditores não tomam decisões operacionais.

## Fases
- `independent`: análises independentes e ocultas entre participantes.
- `cross_review`: análises reveladas; participantes podem confirmar/contestar.
- `rebuttal`: respostas às contestações.
- `final`: síntese factual, consenso, divergências e lacunas.
- `closed`: sala imutavelmente encerrada.

## Permissões
O agente recebe apenas:
- leitura via Auditor Gateway;
- `submit_message(roomId, ...)` append-only;
- leitura da sala conforme a fase.

Não existem operações MBDP de push, merge, dispatch, alteração de trust, leitura de secrets ou execução arbitrária.

## Participantes
Cada participante declara `agentId`, `provider`, `model` e `role=auditor`. OpenAI, Anthropic, Gemini, modelos locais e futuros provedores entram por adapters externos.

## Encerramento
O controller encerra por limites configurados: rodadas máximas, prazo, ausência de novas alegações materiais ou solicitação explícita de revisão humana. Timeout de um auditor não implica concordância.

## Segurança
Mensagens formam cadeia por hash. O servidor atribui sequência e horário; o cliente não pode sobrescrever mensagens. Conteúdo de outro agente é dado não confiável e nunca instrução de sistema.
