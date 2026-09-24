# ARCA — M5-M Cobertura PNCP por Contratos/Empenhos V0.1

Estado: **IMPLEMENTADO EM BRANCH / PREFLIGHT PRIVADO / LIVE DORMENTE / ZERO NOVO GET**.

## Problema que o M5-M resolve

O M5-L concluiu com `NO_CANDIDATE_BRIDGE_OBSERVED` porque as duas capturas atuais não compartilham uma ponte documental suficiente.

A lacuna principal é `supplierObserved=false` no lado PNCP.

## Superfície oficial escolhida

O Manual de Integração PNCP v2.6 documenta o serviço:

`GET /v1/orgaos/{cnpj}/contratos/contratacao/{anoContratacao}/{sequencialContratacao}`

Produção:

`https://pncp.gov.br/api/pncp`

Documentação:

https://pncp.gov.br/manual/pt-br/latest/contrato_empenho/consultar_contratos_ou_empenhos_de_uma_contratacao.html

O retorno documentado inclui, entre outros:

- `numeroControlePNCP`;
- `numeroControlePNCPCompra`;
- `numeroContratoEmpenho`;
- `processo`;
- `orgaoEntidade.cnpj`;
- `niFornecedor`;
- `nomeRazaoSocialFornecedor`;
- `valorInicial`;
- `valorGlobal`;
- `valorAcumulado`.

Essa superfície é preferida antes do aprofundamento item→resultado porque pode fornecer, em uma única chamada por contratação:

1. fornecedor identificado;
2. referência direta à contratação PNCP;
3. número de contrato/empenho;
4. processo;
5. órgão estruturado;
6. valores contratuais.

## Orçamento do gate

A normalização PNCP atual contém exatamente 2 contratações.

O M5-M fixa:

- `maxRequests=2`;
- `retries=0`;
- `timeoutMs=30000`;
- `maxBytesPerResponse=65536`;
- `maxResponseRecords=25`.

Cada contratação gera exatamente um alvo allowlisted.

## Privacidade do preflight

O preflight abre somente o envelope PNCP normalizado já existente no cofre privado.

Os identificadores reais são usados apenas dentro do runner privado para montar os caminhos.

A saída pública contém apenas:

- `targetCount`;
- hashes dos alvos;
- `planSha256`;
- `candidateSha256`;
- budgets;
- tipos de cobertura esperada.

A prova sanitizada não contém CNPJ, ano, sequencial, número de compra, processo ou URL completa.

## Live dormente

O workflow live:

`.github/workflows/arca-m5-pncp-contract-coverage-live.yml`

só aceita branch:

`m5-pncp-contract-coverage-live-c<CANDIDATE_SHA256>`

e ainda exige:

`ARCA_M5_M_CONFIRMATION=PNCP_CONTRACT_COVERAGE_GET_ONLY`.

Sem o hash canônico e a confirmação explícita, o transporte não é criado.

## Transporte

O transporte aceita exclusivamente:

`https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/contratos/contratacao/{ano}/{sequencial}`

Método: `GET`.

- redirects proibidos;
- nenhum retry;
- exatamente 2 requests no plano atual;
- 64 KiB por resposta;
- timeout de 30 s.

## Custódia

Se futuramente autorizado, cada resposta será escrita em staging privado, o conjunto será selado em envelope AES-256-GCM e persistido no cofre privado antes de qualquer uso investigativo.

A prova pública conterá somente status HTTP, bytes, hashes, contagem estrutural e presença/ausência dos campos documentados.

Nenhum nome de fornecedor ou valor será publicado automaticamente.

## Limites

O M5-M não autoriza:

- executar os GETs;
- inferir fornecedor;
- confirmar correlação;
- executar M5-B;
- publicar valores ou nomes;
- produzir conclusão adversa.

Mesmo se `niFornecedor` coincidir futuramente com algum identificador de execução financeira, isso apenas cria uma ponte documental a ser validada em gate posterior.

## Próximo passo

1. CI verde;
2. merge;
3. executar somente o preflight privado na revisão final;
4. obter `candidateSha256` e os 2 hashes de alvo;
5. solicitar autorização humana explícita para exatamente os 2 GETs;
6. somente então criar o branch live.

Nenhum GET PNCP é necessário para concluir esta etapa.
