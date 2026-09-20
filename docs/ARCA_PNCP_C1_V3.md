# ARCA PNCP C1 — conector publico controlado para Machine Bridge V3

## Estado

Este perfil cobre C1a e C1b do conector PNCP no V3.

Disponivel:

- validacao estrutural de CNPJ numerico ou alfanumerico;
- plano deterministico de consulta por CNPJ, ano e sequencial;
- allowlist exclusiva `https://pncp.gov.br/api/pncp`;
- somente endpoints `/v1/...` e metodo GET;
- transporte HTTP com rede desabilitada por padrao;
- timeout, limite de bytes e retries limitados;
- redirect automatico desabilitado;
- nenhuma credencial/Authorization para PNCP publico;
- snapshot de contratacao, itens, resultados, contratos e fontes orcamentarias;
- captura dos bytes recebidos pela camada de aquisicao/cadeia de custodia;
- normalizacao de bundle PNCP para registros AIE;
- acao remota `pncp.plan`, que apenas gera o plano e nunca habilita rede;
- acao opcional `pncp.acquire-public` para workers persistentes explicitamente configurados.

O worker canônico do GitHub Actions continua **sem** `pncp-public-network` e sem habilitacao de rede PNCP.

Ainda nao habilitado no worker canônico:

- aquisicao PNCP por rede no GitHub Actions;
- descoberta ampla por municipio/periodo;
- aprofundamento automatico;
- download de documentos vinculados;
- promocao automatica de snapshot para evidencia ou achado.

## Base oficial

O conector usa apenas `https://pncp.gov.br/api/pncp`, conforme o Manual de Integracao PNCP v2.6 consultado em 2026-09-16. Rotas legadas de `/api/consulta` nao fazem parte da allowlist deste perfil.

## Fronteira de rede C1b

`pncp.acquire-public` somente e registrado quando o host fornece simultaneamente:

- capability `pncp-public-network`;
- `ARCA_PNCP_PUBLIC_NETWORK_ENABLED=true`;
- `ARCA_PNCP_CUSTODY_HOME`;
- `ARCA_PNCP_STAGING_ROOT`.

Alem disso, cada job precisa declarar `authorizePublicNetwork: true` e fornecer `investigationId`, `sourceId` e um target PNCP estruturado. O job nao escolhe host, URL arbitraria, metodo HTTP ou caminhos locais de custodia.

A identidade registrada na cadeia e a identidade do worker, com role `authorized-pncp-public-worker`.

## Cadeia de custodia

Uma resposta HTTP conserva:

- URL efetivamente consultada;
- timestamp de acesso;
- status e content-type;
- bytes exatos;
- SHA-256 dos bytes;
- numero de tentativas.

`capturePncpResponse()` passa os bytes para o Acquisition Adapter e verifica se o hash preservado coincide com o hash recebido. `capturePncpSnapshotResponses()` somente marca `analysisMayProceed: true` se todas as respostas bem-sucedidas do snapshot tiverem sido capturadas.

O resultado de `pncp.acquire-public` nao devolve os bytes brutos. Ele retorna somente metadados de recursos, hashes e referencias de custodia. Os bytes permanecem no `custodyHome` persistente configurado no host.

## Por que a rede continua desligada no GitHub Actions

O filesystem de um runner hospedado e efemero. Ativar aquisicao nele antes de existir uma persistencia remota de custodia poderia produzir um resultado duravel no repositorio enquanto os bytes originais desaparecem com o runner. Por isso C1b habilita a acao apenas para workers cuja instalacao configure armazenamento persistente; o workflow canônico continua somente com `pncp-plan`.

## Proximo gate

C1c deve criar persistencia remota verificavel para os artefatos de custodia, com integridade e idempotencia, antes de considerar adicionar `pncp-public-network` ao worker canônico do GitHub Actions.
