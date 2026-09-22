# ARCA M5 — Plano de implementação live correlacionado limitado

**Estado:** planejamento offline; nenhuma rede autorizada por este documento.

## Fase A — Contrato e fixtures sintéticas

- definir `M5InvestigationManifestV1` com pergunta, escopo, fontes, budgets, revisões e critérios de parada;
- criar fixture sintética representando respostas já custodiais de PNCP e Portal;
- validar que nenhum correlator recebe bytes não custodiais;
- fixar estados de normalização e erros fail-closed;
- testar `NOT_OBSERVED`, conflito, estorno, duplicidade e schema drift.

## Fase B — Normalizadores live separados

- criar normalizador PNCP live somente a partir de schema observado/documentado;
- criar normalizador Portal live somente após o primeiro M4 Portal real;
- cada normalizador recebe referência/hash custodial, nunca segredo;
- produzir Evidence Envelopes derivados e hash-bound;
- bloquear campos extras/ambíguos até revisão explícita.

## Fase C — Correlator M5

- reaproveitar regras M2 sem reaproveitar premissas sintéticas;
- exigir endpoints de relação presentes no conjunto de evidência live do ciclo;
- preservar `CONFIRMED`, `CANDIDATE`, `CONFLICTING`, `NOT_OBSERVED`;
- impedir dupla contagem e registrar explicações alternativas;
- emitir relatório sanitizado determinístico.

## Fase D — Multiagente e verificação

- executar `PROVENANCE_ANALYST` e `COMPARABILITY_ANALYST` independentemente;
- congelar digest de entrada comum;
- executar verificador adversarial depois das duas análises;
- persistir desafios e contraprovas;
- enviar resultado à Human Review Queue.

## Fase E — Gate live M5

- selecionar uma investigação concreta somente depois de M4 aceito;
- pré-registrar manifesto e hash;
- executar PNCP e Portal em runs separados;
- validar custódia de cada run antes de normalizar;
- executar correlação somente após ambas as fontes estarem elegíveis;
- produzir checkpoint numerado e atualizar roadmap/matriz.

## Testes obrigatórios

- zero rede nos testes/CI;
- fonte extra ou endpoint divergente falha antes de transporte;
- custódia inválida bloqueia normalização;
- schema drift vira `NORMALIZATION_FAILED`, não vazio;
- `NOT_OBSERVED` nunca vira suspeita;
- relação sem evidência do ciclo falha fechado;
- agentes recebem o mesmo digest e não compartilham rascunho;
- verificador preserva contraprova;
- saída pública não contém bytes brutos, token ou identificadores desnecessários;
- publicação/classificação automática permanecem desligadas.

## Gates

1. M4b integrado e CI pós-merge verde.
2. Primeiro Portal live custodiado ou falha registrada corretamente.
3. Schema observado documentado.
4. Implementação M5 passa testes offline.
5. PR M5 passa CI canônica.
6. Somente então pedir autorização separada para a execução M5 concreta.

## Não dependências

- ChatGPT Work não é obrigatório;
- Edge Steward não é obrigatório;
- Vince não é obrigatório;
- operação 24/7 não é necessária para a prova M5.

Essas camadas podem ser integradas futuramente, mas não devem bloquear a validação do núcleo investigativo.
