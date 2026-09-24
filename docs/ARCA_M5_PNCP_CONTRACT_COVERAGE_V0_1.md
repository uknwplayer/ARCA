# ARCA — M5-M Cobertura PNCP por Contratos/Empenhos V0.1

Estado: **M5-M V1 EXECUTADO COM 400/400; DRIFT MANUAL↔RUNTIME DIAGNOSTICADO; CORREÇÃO `pagina=1` IMPLEMENTADA EM BRANCH; ZERO NOVO GET APÓS O DIAGNÓSTICO**.

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

O transporte corrigido aceita exclusivamente:

`https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/contratos/contratacao/{ano}/{sequencial}?pagina=1`

Método: `GET`.

### Drift observado entre manual e runtime

O run `36036733351` executou exatamente os 2 GETs autorizados, zero retries, e recebeu HTTP 400 em ambos. As duas respostas foram seladas antes do diagnóstico.

O diagnóstico offline `36037934342` mostrou:

- mesmo shape JSON nos dois erros;
- mesma mensagem, com SHA-256 `c1d6bb85779fbebfd285b2e31d103f4c4b97ccf8128403e5a1db6092833f6fc2`;
- esse hash corresponde exatamente à mensagem genérica Spring que informa ausência do request parameter obrigatório `pagina`, do tipo `Integer`;
- nenhuma menção a CNPJ, ano ou sequencial inválido;
- nenhum sinal de 401/403.

O Manual PNCP v2.6, na seção 13.10, continua documentando apenas `cnpj`, `anoContratacao` e `sequencialContratacao` e mostra exemplo sem query string. Portanto o ARCA registra **drift de runtime/documentação**, não erro dos identificadores privados.

Correção mínima escolhida: adicionar somente `pagina=1`.

Não foi adicionado `tamanhoPagina`, pois o erro observado não o exigiu. Se o runtime futuramente exigir outro parâmetro, o gate deve parar sem retry.

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

1. validar a correção `pagina=1` no CI;
2. integrar;
3. executar somente o preflight privado na revisão final;
4. obter **novo** `planSha256`, `candidateSha256` e hashes de alvo, pois a query passou a fazer parte do alvo;
5. solicitar nova autorização humana explícita para exatamente os 2 GETs corrigidos;
6. somente então criar novo branch live.

A autorização anterior foi consumida e não pode ser reutilizada.

Nenhum novo GET PNCP é necessário para concluir esta correção.
