# ARCA — Handoff checkpoint 2026-09-22 / 006: M2 integrado

Estado: **M2 concluído e integrado à `main`; CI pós-merge verde**.

Repositório canônico: `uknwplayer/ARCA`.  
Commit M2: [`bb006433f21a622aea4aaf618b728a19e4c327f5`](https://github.com/uknwplayer/ARCA/commit/bb006433f21a622aea4aaf618b728a19e4c327f5).  
PR: [#79](https://github.com/uknwplayer/ARCA/pull/79).  
CI da PR: [35690853847](https://github.com/uknwplayer/ARCA/actions/runs/35690853847).  
CI pós-merge: [35690990372](https://github.com/uknwplayer/ARCA/actions/runs/35690990372).

Este checkpoint fecha o M2 e ativa M3 como próximo marco.

## Escopo entregue

O M2 adiciona um núcleo determinístico e offline para representar vínculos entre execução financeira e contratação sem usar similaridade superficial como prova.

Arquivos principais:

- `src/investigation/financial-correlation-offline.mjs`;
- `tests/financial-correlation-offline.test.mjs`;
- `examples/multisource-offline-fixtures/financial-correlation-m2-v1.json`;
- `scripts/validate-financial-correlation-offline.mjs`;
- `docs/ARCA_FINANCIAL_CORRELATION_OFFLINE_M2.md`.

O CI principal passa a executar `npm run validate:financial-correlation`.

## Relação pagamento → empenhos impactados

A base pública do Portal da Transparência documenta que um documento de pagamento pode pagar mais de um empenho e publica o conjunto `Despesas_Pagamento_EmpenhosImpactados`.

A fixture M2 preserva essa cardinalidade:

- 3 pagamentos;
- 4 relações pagamento→empenho;
- um pagamento ligado a dois empenhos.

Cada relação sintética é `CONFIRMED` somente quanto ao vínculo representado pela linha da fixture. Isso não afirma regularidade, entrega, preço adequado ou identidade do favorecido final.

## Relação empenho ↔ contratação

O correlator produz quatro estados:

- `CONFIRMED`: ponte documental forte com proveniência;
- `CANDIDATE`: múltiplos identificadores canônicos compatíveis, sem ponte forte;
- `CONFLICTING`: ponte forte com contraprova preservada;
- `NOT_OBSERVED`: nenhum vínculo verificável no escopo.

A fixture contém um caso de cada estado.

Regras:

- nome isolado não identifica;
- valor isolado não identifica;
- proximidade temporal não confirma vínculo;
- `NOT_OBSERVED` não significa desaparecimento;
- contraprova nunca é descartada para forçar confirmação.

## Identidade e minimização

Foram adicionadas referências canônicas hash-only para entidades.

Namespaces aceitos no M2:

- `CNPJ`;
- `SIAFI_ORG`;
- `SIAFI_UG`;
- `SIAFI_GESTAO`;
- identificadores explicitamente sintéticos de fixture.

O relatório não precisa transportar o identificador bruto para comparar entidades no mesmo namespace. Não há equivalência automática entre namespaces diferentes.

## Proveniência

Toda relação preserva:

- referências de origem;
- sinais usados;
- contraprovas, quando existirem;
- distância temporal, quando aplicável;
- explicações alternativas;
- hash determinístico.

O relatório final usa referências hash para pagamento, empenho, contratação e entidades.

## Verificação

CI pós-merge no Node 22.18:

- **878/878 testes Node**;
- **27/27 testes Python**;
- piloto investigativo controlado: **PASS**;
- Gate Offline Multifonte V1: **PASS**;
- Gate M2: **PASS**;
- verificação pública: **sem violações**.

Validação M2:

- report SHA-256: `27dfca7e04f3068fda3446254378a9ecfb13dd074ce0932eedf2bacba54e36a0`;
- fixture SHA-256: `3355887e5c538a1fa15b2193da2b1076949d21efbf52e3549055c4459fb4b35e`;
- relation states: 1 `CONFIRMED`, 1 `CANDIDATE`, 1 `CONFLICTING`, 1 `NOT_OBSERVED`;
- network used: `false`;
- publication attempted: `false`;
- human review required: `true`;
- adverse finding: `false`.

## Limites

M2 continua totalmente sintético.

Não foi capturado:

- CSV oficial real;
- pagamento real;
- empenho real;
- ligação real com PNCP;
- localização territorial real do gasto.

M2 prova o **contrato de correlação**, não uma conclusão factual sobre qualquer despesa pública.

## Decisão sobre Edge Steward

O [PR #78](https://github.com/uknwplayer/ARCA/pull/78) permanece draft e congelado.

Decisão do projeto: o ARCA Edge Steward não será implementado nem integrado antes de o núcleo investigativo estar funcional de verdade e online. Sua documentação fica preservada para retomada futura.

## Próximo marco — M3

Objetivo: integrar o correlator M2 ao Gate Offline Multifonte completo.

Requisitos:

1. PNCP + pagamento + empenhos impactados no mesmo piloto;
2. três UFs;
3. orçamento fixo;
4. deduplicação;
5. dois agentes independentes;
6. verificação adversarial;
7. Human Review Queue;
8. métricas de correlação/conflito/ausência;
9. relatório sanitizado;
10. rede e publicação desligadas.

M4, primeira coleta live das fontes de forma separada, só pode ser iniciado após M3 verde.

## Comandos de retomada

```bash
npm ci
node --test tests/financial-correlation-offline.test.mjs
npm run validate:financial-correlation
npm run validate:multisource
npm test
PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v
PYTHONPATH=. python scripts/validate-investigative-roadmap.py
npm run check:public
```

## Condições de parada

Parar se houver:

- relação afirmada por nome/valor isolado;
- `NOT_OBSERVED` interpretado como desaparecimento;
- contraprova descartada;
- proveniência ausente;
- identificador bruto vazando onde hash é suficiente;
- rede ativada sem gate;
- publicação automática;
- tentativa de reativar Edge Steward no caminho crítico antes do núcleo online.
