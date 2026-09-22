# ARCA M4b — Desenho para revisão: contrato do Portal e captura limitada

Estado: **RASCUNHO PARA REVISÃO; SEM AUTORIZAÇÃO DE IMPLEMENTAÇÃO OU GET**. Data: 2026-09-22. Base: `main` após PR #85 (`9224471ea4b3d3bbad5ebd2888a5862f6fe66f11`). Este texto detalha a parte Portal do desenho M4 aprovado em `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md`.

## Finalidade e critério de aceite

Preparar um único acesso pontual a documento de despesa federal que possa ser testado inteiramente com transporte falso, cifrado e persistido em cofre privado antes de produzir recibo sanitizado. O primeiro GET real exige escopo concreto e autorização posterior específica. Sem classificação, correlação, publicação, município/UF padrão ou declaração de cobertura nacional.

## Descoberta documental em 2026-09-22

| Afirmação | Evidência primária | Estado |
|---|---|---|
| Existe GET `/api-de-dados/despesas/empenhos-impactados`, descrito como consulta por documento/fase | [Swagger UI oficial](https://api.portaldatransparencia.gov.br/swagger-ui/index.html) (índice renderizado em busca) | Confirmado apenas caminho, método e descrição |
| A API usa token obtido por cadastro e enviado ao e-mail associado ao Gov.br | [Cadastro oficial](https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email) | Confirmado; cabeçalho de autenticação ainda a validar |
| O Swagger anuncia OAS 3.0 em `/v3/api-docs` | [Swagger UI oficial](https://api.portaldatransparencia.gov.br/swagger-ui/index.html) | Confirmado; corpo JSON completo não ficou acessível no ambiente |
| Nomes, tipos, obrigatoriedade e significado de `codigoDocumento`, `fase`, `pagina`; resposta `EmpenhoImpactadoBasicoDTO`; status HTTP | Operação específica do Swagger, ainda não recuperada | **Não confirmado**; não codificar mapeamento como fato |

O catálogo não oficial exibe uma URL de exemplo com `codigoDocumento`, `fase=2` e `pagina=1`, mas contém metadados inconsistentes para essa operação. É pista de pesquisa, não base suficiente para contrato nem para escolher um documento real. A tentativa de ler o OpenAPI por `curl` do ambiente expirou; a ferramenta de consulta web reconheceu JSON em `/v3/api-docs`, mas não apresentou seus campos. Nenhum GET ao endpoint de dados foi tentado.

## Abordagens e decisão proposta

1. **API pontual de empenhos impactados**: menor carga, vínculo financeiro diretamente relevante. Preferida depois de recuperar a operação oficial completa.
2. **GET de documento por código**: caminho oficial visível, mas não fornece necessariamente os vínculos pagamento→empenho. Usar apenas se o objetivo do ciclo for reduzido e o contrato oficial do GET for validado.
3. **Download mensal completo**: oficial, porém orçamento e parser próprios; fora deste ciclo.

Se o contrato oficial permanecer inacessível, encerrar este ciclo na documentação, sem transporte baseado em parâmetros presumidos. Um operador pode acessar o Swagger oficial no navegador e fornecer a seção da operação ou o trecho OpenAPI correspondente **sem token, código privado nem dados pessoais**; depois disso registrar URL, data e digest do contrato validado antes de escrever testes.

## Contrato pretendido após validação oficial

- M4a `buildM4ControlledScope` continua sendo o pré-registro offline, hash-only e `networkAuthorizedForThisManifest:false`; não converter essa flag automaticamente em permissão de rede. Extender manifesto de execução separado somente após especificação da rota e query.
- Validar versão/revisão, host fixo HTTPS, rota exata, método GET, query allowlisted, fase de pagamento e página 1 contra contrato oficial; documento explícito somente em canal privado. Exatamente uma chamada, timeout até 30 s, zero retry, resposta até 64 KiB. Bloquear redirecionamentos, URL alternativa, corpo maior, `content-length` divergente e status inesperado.
- Passar token por cabeçalho oficial confirmado, nunca query, log, erro público, relatório ou artefato. Verificar token e cofre privado antes de iniciar a chamada. Resposta bruta e URL com código ficam somente no envelope criptografado.
- Encadear aquisição → captura de bytes e metadados → criptografia → persistência durável verificada → recibo sanitizado. Um erro de persistência proíbe sucesso, análise e publicação. Resposta vazia, 401/403, 429, timeout e 5xx viram estados distintos de lacuna/erro de autorização ou contrato, sem inferência de irregularidade.
- Testes RED com `fetch` injetável devem provar chamada única, URL/headers exatos após validação, limite em streaming, abort, host fixo, token ausente, redirecionamento, status e erro de custódia. CI Node 22.18, Python, M0–M3 e `check:public` devem permanecer verdes.
- Workflow manual, se implementado, deve iniciar sem gatilho recorrente, exigir escopo e confirmação específica, autenticar segredo e cofre, e deixar classificador, ingresso, correlação e publicação desligados. Mesmo com CI verde, nenhuma execução live decorre deste desenho.

## Revisão necessária antes do plano de implementação

Confirmar a operação oficial completa e avaliar se o orçamento de 64 KiB comporta a resposta sem truncamento; se não comportar, rejeitar e planejar outro ciclo em vez de aumentar o teto implicitamente. Registrar esquema de resposta como *observação contratual*, sem reutilizar o parser sintético de CSV M1. O plano de implementação virá após a revisão deste desenho e terá tarefas testáveis separadas para transporte, custódia e workflow.
