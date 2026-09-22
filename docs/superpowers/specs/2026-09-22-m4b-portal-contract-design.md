# ARCA M4b — Desenho para revisão: contrato do Portal e captura limitada

Estado: **DESENHO APROVADO PELO CRIADOR; CONTRATO VISÍVEL CONFERIDO, PLANO DE IMPLEMENTAÇÃO PARA REVISÃO; SEM GET**. Data: 2026-09-22. Base: `main` após PR #85 (`9224471ea4b3d3bbad5ebd2888a5862f6fe66f11`). Este texto detalha a parte Portal do desenho M4 aprovado em `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md`.

## Finalidade e critério de aceite

Preparar um único acesso pontual a documento de despesa federal que possa ser testado inteiramente com transporte falso, cifrado e persistido em cofre privado antes de produzir recibo sanitizado. O primeiro GET real exige escopo concreto e autorização posterior específica. Sem classificação, correlação, publicação, município/UF padrão ou declaração de cobertura nacional.

## Descoberta documental em 2026-09-22

| Afirmação | Evidência primária | Estado |
|---|---|---|
| Existe GET `/api-de-dados/despesas/empenhos-impactados`, descrito como consulta por documento/fase | [Swagger UI oficial](https://api.portaldatransparencia.gov.br/swagger-ui/index.html) (índice renderizado em busca) | Confirmado apenas caminho, método e descrição |
| A API usa token obtido por cadastro e enviado ao e-mail associado ao Gov.br | [Cadastro oficial](https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email) | Confirmado; o cabeçalho consta nos exemplos oficiais abaixo |
| O Swagger anuncia OAS 3.0 em `/v3/api-docs` | [Swagger UI oficial](https://api.portaldatransparencia.gov.br/swagger-ui/index.html) | Confirmado; corpo JSON completo não ficou acessível no ambiente |
| `codigoDocumento` é query string obrigatória e identifica UG + Gestão + Número; `fase` é query int32 obrigatória, 2=liquidação e 3=pagamento; `pagina` é query int32 obrigatória com default 1 | Captura da operação expandida no [Swagger oficial](https://api.portaldatransparencia.gov.br/swagger-ui/index.html) enviada pelo criador em 2026-09-22 | Confirmado visualmente; código concreto não selecionado |
| Respostas documentadas 200, 400, 401 e 500; exemplo 200 inclui `empenho`, `subitem`, `empenhoResumido`, `valorLiquidado`, `valorPago`, `valorRestosInscrito`, `valorRestoCancelado`, `valorRestoPago` como strings | Mesma captura oficial | Confirmado apenas exemplo exibido, não cardinalidade/schema completo; capturar bytes sem interpretar |
| Cabeçalho `chave-api-dados` | [Exemplos oficiais da API](https://portaldatransparencia.gov.br/pagina-interna/603579-api-de-dados-exemplos-de-uso) | Confirmado como cabeçalho; token nunca entra na URL |

O catálogo não oficial continha dados inconsistentes; a captura oficial enviada posteriormente resolveu os parâmetros necessários à chamada limitada. A tentativa de ler o OpenAPI por `curl` do ambiente expirou; por isso a cardinalidade e o schema completo da resposta não são pressupostos. Nenhum GET ao endpoint de dados foi tentado.

## Abordagens e decisão proposta

1. **API pontual de empenhos impactados**: menor carga, vínculo financeiro diretamente relevante. Preferida; parâmetros necessários confirmados na captura oficial.
2. **GET de documento por código**: caminho oficial visível, mas não fornece necessariamente os vínculos pagamento→empenho. Usar apenas se o objetivo do ciclo for reduzido e o contrato oficial do GET for validado.
3. **Download mensal completo**: oficial, porém orçamento e parser próprios; fora deste ciclo.

O código de documento real e token não pertencem ao código do projeto nem ao PR. O exemplo de 200 da documentação não justifica normalizar linhas financeiras nem presumir ausência de dados quando a resposta for vazia.

## Contrato pretendido após validação oficial

- M4a `buildM4ControlledScope` continua sendo o pré-registro offline, hash-only e `networkAuthorizedForThisManifest:false`; não converter essa flag automaticamente em permissão de rede. Extender manifesto de execução separado somente após especificação da rota e query.
- Validar versão/revisão, host fixo HTTPS, rota exata, método GET, query allowlisted `codigoDocumento`, `fase=3` e `pagina=1`; documento explícito somente em canal privado. Exatamente uma chamada, timeout até 30 s, zero retry, resposta até 64 KiB. Bloquear redirecionamentos, URL alternativa, corpo maior, `content-length` divergente e status inesperado.
- Passar token por cabeçalho `chave-api-dados`, nunca query, log, erro público, relatório ou artefato. Verificar token e cofre privado antes de iniciar a chamada. Resposta bruta e URL com código ficam somente no envelope criptografado.
- Encadear aquisição → captura de bytes e metadados → criptografia → persistência durável verificada → recibo sanitizado. Um erro de persistência proíbe sucesso, análise e publicação. Resposta vazia, 401/403, 429, timeout e 5xx viram estados distintos de lacuna/erro de autorização ou contrato, sem inferência de irregularidade.
- Testes RED com `fetch` injetável devem provar chamada única, URL/headers exatos após validação, limite em streaming, abort, host fixo, token ausente, redirecionamento, status e erro de custódia. CI Node 22.18, Python, M0–M3 e `check:public` devem permanecer verdes.
- Workflow manual, se implementado, deve iniciar sem gatilho recorrente, exigir escopo e confirmação específica, autenticar segredo e cofre, e deixar classificador, ingresso, correlação e publicação desligados. Mesmo com CI verde, nenhuma execução live decorre deste desenho.

## Revisão do plano de implementação

O criador aprovou este desenho e enviou a captura que confirma os parâmetros e respostas visíveis. No primeiro retorno real, se o orçamento de 64 KiB não comportar a resposta, rejeitar e planejar outro ciclo em vez de aumentar o teto implicitamente. Registrar esquema de resposta como *observação contratual*, sem reutilizar o parser sintético de CSV M1. O plano de implementação separa transporte, custódia e workflow para revisão antes do código.
