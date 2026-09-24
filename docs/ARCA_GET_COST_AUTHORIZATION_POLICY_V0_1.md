# ARCA — Política de autorização de GET por custo monetário V0.1

Estado: **VIGENTE PARA NOVAS EXECUÇÕES APÓS INTEGRAÇÃO**.

## Regra

O ARCA não pede autorização humana apenas porque uma operação é um `GET`.

A exigência de autorização humana para `GET` passa a depender de **custo monetário**:

### GET sem cobrança monetária observada

Estado:

`AUTO_EXECUTION_ALLOWED`

Regras:

- não exige autorização humana por request;
- pode executar automaticamente dentro de allowlist, budgets, rate limits e contratos de fonte;
- retries continuam definidos pelo gate específico;
- custódia, hashes e fail-closed continuam obrigatórios quando aplicáveis;
- publicação e correlação não são autorizadas por esta política.

### GET com custo monetário

Estado:

`AWAITING_HUMAN_COST_AUTHORIZATION`

Regras:

- exige autorização humana antes de gerar gasto;
- o gate deve informar o modelo de cobrança conhecido e o budget monetário;
- autorização é limitada ao escopo/budget aprovado.

### Custo desconhecido

Estado:

`HOLD_FOR_COST_CLASSIFICATION`

Regras:

- não executa até classificar o modelo de cobrança;
- não pede autorização humana prematuramente;
- primeiro consulta documentação/termos oficiais para decidir se há custo.

## Fora do escopo

Esta política não concede automaticamente:

- POST, PUT, PATCH, DELETE ou qualquer mutação;
- bypass de autenticação;
- uso de credenciais fora do escopo;
- publicação;
- correlação investigativa;
- conclusão adversa;
- expansão de budget sem contrato;
- violação de rate limit ou termos de serviço.

Esses controles continuam independentes.

## PNCP

O Manual de Integração PNCP v2.6 informa que o acesso ao Portal de consultas é público, enquanto APIs de manutenção exigem autenticação/autorização.

Para os GETs públicos de consulta do PNCP, o ARCA registra:

`costClass=NO_MONETARY_CHARGE_OBSERVED`

`humanAuthorizationRequired=false`

`autoExecutionAllowed=true`

Evidência documental:

`PNCP_MANUAL_V2_6_PUBLIC_CONSULTATION`

## M5-N1

A decisão operacional vigente reduz:

`tamanhoPagina: 50 → 10`

mantendo:

- `pagina=1`;
- exatamente 2 alvos atuais;
- `maxRequests=2`;
- `retries=0`;
- nenhuma consulta de resultados;
- nenhuma publicação;
- nenhuma correlação.

Uma página com exatamente 10 itens passa a ser tratada como potencialmente truncada.

O candidato anterior com `tamanhoPagina=50` torna-se obsoleto por mudança do plano/hash.
