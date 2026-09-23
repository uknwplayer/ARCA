# ARCA — M5 Fase C: Observação estrutural do schema Portal V0.1

Estado: **IMPLEMENTAÇÃO CANDIDATA / OFFLINE / SEM NOVO GET**.

Issue: #161.

## Objetivo

Preparar o primeiro 2xx real do Portal da Transparência para que o ARCA consiga observar o schema efetivamente recebido **depois da custódia** e **antes de qualquer normalização**.

A Fase C não inventa o parser. Ela registra a estrutura observada e exige revisão humana.

## Fluxo

```text
GET Portal autorizado
        ↓
bytes originais
        ↓
custódia privada durável
        ↓
reabertura + verificação dos mesmos bytes
        ↓
M5-C observador estrutural
        ↓
SCHEMA_OBSERVED
ou
SCHEMA_DRIFT_REVIEW_REQUIRED
        ↓
revisão humana
        ↓
design do parser
        ↓
implementação/testes do parser em gate separado
```

## O que a observação contém

Somente metadados estruturais:

- tipo da raiz;
- quantidade de registros;
- quantidade de registros-objeto;
- quantidade de registros incompatíveis;
- nomes de campos;
- tipos observados por campo;
- presença de cada campo;
- se o campo apareceu em todos os registros-objeto observados;
- hashes da estrutura e da própria observação;
- vínculos aos hashes de scope, resposta, envelope e recibo de custódia.

## O que NÃO contém

- valores dos registros;
- documento bruto;
- favorecido;
- valores monetários;
- código do documento alvo;
- token;
- segredo de custódia;
- parser admitido;
- normalização;
- publicação;
- achado adverso.

Flags obrigatórias:

- `valuesIncluded=false`;
- `rawBytesIncluded=false`;
- `normalizationPerformed=false`;
- `parserAdmitted=false`;
- `observerNetworkUsed=false`;
- `publicationAttempted=false`;
- `adverseFinding=false`;
- `humanReviewRequired=true`.

## Integração com o probe M4b

O probe existente passa a executar o observador somente depois de:

1. capturar a resposta;
2. hashear os bytes;
3. selar os bytes originais;
4. persistir em custódia privada;
5. verificar o recibo;
6. reabrir o envelope e provar igualdade byte a byte.

Se o JSON for válido, a observação estrutural é anexada ao proof final.

Isso ocorre independentemente da validação DTO atual. Portanto, se o endpoint devolver um JSON estruturalmente válido com campos novos, o probe ainda pode falhar em `DTO_SCHEMA_INVALID`, mas a estrutura real permanece registrada como evidência sanitizada para revisão.

## Drift

Estados:

- `SCHEMA_OBSERVED`: raiz em array, registros-objeto e orçamento estrutural respeitado;
- `SCHEMA_DRIFT_REVIEW_REQUIRED`: raiz incompatível, registro não-objeto ou quantidade acima do orçamento.

Schema drift nunca autoriza adaptação automática.

## Revisão humana

O módulo permite registrar uma decisão:

- `APPROVE_FOR_PARSER_DESIGN`;
- `REJECT_SCHEMA`;
- `HOLD_FOR_MORE_EVIDENCE`.

Mesmo `APPROVE_FOR_PARSER_DESIGN` mantém:

- `parserImplementationAuthorized=false`;
- `normalizationAuthorized=false`;
- `networkAuthorized=false`;
- `publicationAuthorized=false`.

Ou seja: a revisão autoriza **projetar** o parser, não executá-lo em produção.

## Limite atual

Nenhum 2xx Portal real foi obtido por este trabalho. Nenhum GET foi executado.

A Fase C apenas prepara o caminho para quando existir:

`token ativo → autorização explícita → 1 GET → 2xx custodial`.

## Reprodução

```bash
node --test tests/m5-portal-schema-observer.test.mjs
npm run validate:m5-phase-c
```
