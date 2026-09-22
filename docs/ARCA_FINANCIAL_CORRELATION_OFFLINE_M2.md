# ARCA — M2: correlação PNCP ↔ execução financeira offline

Estado: **IMPLEMENTAÇÃO EM VALIDAÇÃO**.

Objetivo: representar relações verificáveis entre contratação pública e execução financeira sem transformar semelhança de nome, valor ou proximidade temporal em identidade comprovada.

## Base pública usada

O Portal da Transparência documenta que:

- um mesmo documento de pagamento pode pagar mais de um empenho;
- o download de despesas publica o arquivo `AAAAMMDD_Despesas_Pagamento_EmpenhosImpactados.csv`, destinado a indicar os empenhos pagos por cada documento de pagamento;
- a API pública também expõe a consulta `/api-de-dados/despesas/empenhos-impactados` para documento/fase, incluindo fase 3 (Pagamento).

Referências oficiais:

- https://portaldatransparencia.gov.br/dicionario-de-dados/pagamentos
- https://portaldatransparencia.gov.br/download-de-dados/despesas
- https://api.portaldatransparencia.gov.br/swagger-ui/index.html

O M2 **não captura nem presume o layout completo do CSV real**. A fixture reproduz apenas a semântica pública necessária ao teste: um documento de pagamento pode apontar para um ou mais empenhos. O primeiro acesso real ao arquivo continua reservado a um gate posterior.

## Contrato implementado

Módulo:

`src/investigation/financial-correlation-offline.mjs`

Fixture:

`examples/multisource-offline-fixtures/financial-correlation-m2-v1.json`

O correlator trabalha somente offline e retorna referências hash-only para pagamentos, empenhos, contratações e identificadores canônicos.

Identificadores de entidade são normalizados por namespace e transformados em referências hash. O relatório não precisa carregar o identificador bruto para comparar duas entidades.

Namespaces inicialmente aceitos:

- `CNPJ`;
- `SIAFI_ORG`;
- `SIAFI_UG`;
- `SIAFI_GESTAO`;
- namespaces explicitamente sintéticos para fixtures.

Nenhuma equivalência entre namespaces diferentes é inferida automaticamente. Um código SIAFI e um CNPJ, por exemplo, não são considerados a mesma entidade sem uma ponte verificável.

## Relação pagamento ↔ empenho

Cada linha sintética de `Despesas_Pagamento_EmpenhosImpactados` produz uma relação:

`PAYMENT_IMPACTS_COMMITMENT`

No ambiente de fixture essa relação recebe estado `CONFIRMED` porque a própria linha de relação contém a chave do pagamento e a chave do empenho.

Isso confirma **somente a relação representada pela fixture**. Não confirma:

- regularidade da contratação;
- entrega física;
- identidade do beneficiário final;
- adequação de preço;
- inexistência de intermediários.

A fixture inclui um pagamento que impacta dois empenhos para provar a cardinalidade um-para-muitos.

## Relação empenho ↔ contratação

Estados possíveis:

### CONFIRMED

Exige uma ponte documental forte e explicitamente registrada com proveniência.

### CANDIDATE

Pode surgir quando existem múltiplos identificadores canônicos compatíveis — inicialmente órgão e fornecedor — e compatibilidade temporal, mas nenhuma ponte documental forte.

Mesmo nesse estado:

- nome não é usado como identidade;
- valor não é usado como identidade;
- proximidade temporal não confirma vínculo.

### CONFLICTING

Uma ponte forte existe, mas há contraprova/counterevidence explicitamente preservada. O sistema não resolve o conflito sozinho.

### NOT_OBSERVED

Nenhum vínculo verificável foi encontrado no escopo da fixture.

`NOT_OBSERVED` significa apenas ausência de observação naquele escopo. Não significa desaparecimento de dinheiro, desvio ou irregularidade.

## Proveniência

Toda relação contém:

- referências de proveniência;
- contraprovas quando existentes;
- sinais que participaram da classificação;
- diferença temporal quando aplicável;
- explicações alternativas;
- hash determinístico da relação.

A fixture contém os quatro estados para impedir que apenas o caminho positivo seja testado.

## Sanitização

O relatório M2 expõe referências derivadas por SHA-256 para:

- documento de pagamento;
- empenho;
- contratação;
- identificadores canônicos.

Os identificadores sintéticos brutos usados na fixture não aparecem no relatório final.

## Segurança

Invariantes:

- rede bloqueada;
- publicação bloqueada;
- revisão humana obrigatória;
- `adverseFinding=false`;
- anomalia não é irregularidade;
- `NOT_OBSERVED` não é desaparecimento;
- nome ou valor isolado nunca confirma identidade;
- até uma relação `CONFIRMED` não prova regularidade.

## Reprodução

```bash
node --test tests/financial-correlation-offline.test.mjs
npm run validate:financial-correlation
npm test
npm run check:public
```

## Próximo passo após aceite do M2

Integrar este correlator ao Gate Offline Multifonte no M3, usando três UFs, orçamento fixo, dois agentes independentes, verificação adversarial e fila de revisão humana.

Nenhuma consulta live deve ser antecipada por este marco.
