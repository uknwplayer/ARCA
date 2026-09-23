# ARCA — Transferegov Transferências Especiais Offline V0.1

Estado: **IMPLEMENTADO EM PR #179 / OFFLINE FIXTURE / ZERO REDE**.

## Objetivo

Adicionar ao núcleo multifonte do ARCA uma terceira fonte pública executável sem depender do Portal da Transparência: o novo ambiente oficial de APIs de Dados Abertos do Transferegov.br, começando pelo domínio de **Transferências Especiais**.

Fonte canônica:

`https://api-publica.transferegov.gestao.gov.br/`

Página oficial de anúncio/documentação:

`https://www.gov.br/transferegov/pt-br/ferramentas-gestao/api-de-dados-abertos-transferegov.br`

## Escopo V0.1

A V0.1 não faz rede. Ela fornece:

- descriptor atualizado de `br.transferegov.public`;
- `adapterStatus=ACTIVE`;
- único modo executável: `OFFLINE_FIXTURE`;
- adaptador estrito para fixture sintética de Transferências Especiais;
- normalização determinística;
- Evidence Envelopes hash-only;
- lacunas explícitas;
- integração ao Gate Offline Multifonte V1;
- revisão humana obrigatória;
- publicação desligada.

## Campos normalizados da fixture

A fixture V0.1 modela, sem alegar equivalência byte-a-byte com o schema live:

- identificador da transferência;
- código de emenda;
- identificador e nome do ente beneficiário;
- UF e código de município;
- referência sintética do autor;
- ano;
- valor total;
- valor pago;
- estado;
- instante de atualização.

Todos os dados da fixture são sintéticos. Nenhum nome real de parlamentar, município, fornecedor ou entidade é usado como evidência.

## Invariantes

1. Transferência ou pagamento não prova vínculo com contratação.
2. Pagamento não prova entrega física, regularidade ou cumprimento do objeto.
3. Referência de parlamentar é contexto documental, nunca conclusão adversa.
4. Ausência/indisponibilidade da fonte não cria suspeita.
5. O schema live ainda não foi aceito.
6. `PUBLIC_GET` não está habilitado.
7. Nenhuma correlação com PNCP/Portal é automática nesta etapa.
8. Toda saída permanece em `HUMAN_REVIEW`.

## Próximo gate

Antes de qualquer acesso real:

1. identificar o endpoint exato e sua documentação atual;
2. observar/registrar o schema público;
3. definir orçamento de request, paginação, timeout e tamanho;
4. criar transporte separado com fake fetch;
5. pré-registrar escopo;
6. exigir autorização humana específica para um probe live;
7. custodiar a resposta antes de qualquer normalização/correlação.

A integração offline não autoriza rede.
