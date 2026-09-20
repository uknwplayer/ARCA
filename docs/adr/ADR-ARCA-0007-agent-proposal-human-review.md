# ADR-ARCA-0007 — Agente propõe; humano aprova; Core valida

- **Status:** aceito
- **Data:** 2026-09-14
- **Decisão:** agentes não recebem autoridade de escrita. Cada artefato propõe exatamente uma operação vinculada ao `eventHead` e exige revisão humana explícita.

## Contexto

Modelos podem estruturar material e sugerir o próximo passo, mas sua saída é probabilística, suscetível a conteúdo hostil e incapaz de comprovar aquisição, independência ou verdade por si. Aplicação automática violaria “Sem inferência automática” e reduziria a auditabilidade.

## Decisão

Adotar `arca-agent-proposal-v1` com schema fechado, uma operação, premissas, incertezas e `requiresHumanReview: true`. O Workbench gera ID e hashes, mantém o arquivo fora da investigação, exige a frase `APLICAR <proposalId>` e aplica pelo Core com controle otimista. O evento identifica a pessoa revisora e referencia ID e hash da proposta.

## Consequências

- o modelo não pode alegar que salvou ou aplicou uma ação;
- alterações intermediárias tornam a proposta obsoleta;
- uma falha não produz lote parcialmente aplicado;
- auditoria consegue ligar decisão humana, proposta e evento;
- automação de alto volume exige filas de propostas, não autorização silenciosa.

## Alternativas rejeitadas

- acesso direto do modelo ao event store;
- aprovação automática por limiar de confiança;
- lote com várias operações na mesma proposta;
- atribuição do evento ao agente em vez do revisor;
- `expectedEventHead` apenas na camada HTTP, fora do lock do Core.
