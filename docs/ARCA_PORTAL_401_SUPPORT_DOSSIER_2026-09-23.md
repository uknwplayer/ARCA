# ARCA — Dossiê sanitizado para suporte técnico: API Portal HTTP 401

Data: **2026-09-23**.

Finalidade: fornecer informação técnica suficiente para diagnóstico pela CGU sem expor token, código bruto de documento, resposta plaintext ou segredos de custódia.

## Resumo

Uma chave emitida pelo fluxo oficial do Portal da Transparência e recebida por e-mail foi usada em um request controlado à API.

Resultado observado:

- endpoint: `GET /api-de-dados/despesas/documentos-relacionados`;
- host: `https://api.portaldatransparencia.gov.br`;
- autenticação enviada no header `chave-api-dados`;
- HTTP: **401**;
- exatamente **1** request;
- retries: **0**;
- resposta: **169 bytes**;
- resposta criptografada e persistida em custódia privada;
- nenhum token ou corpo plaintext publicado.

## Identificação técnica sanitizada

Run público do workflow:
`35886041113`

Revisão:
`268c8e385d8345d5a02ce2fd3350b1ea1088481a`

Fingerprint da credencial:
`37c90b46b7e1a4fcf699aee3f94979829cb044d13979cfbf05a229cd869a8092`

Proveniência declarada:
`OFFICIAL_EMAIL_REGISTRATION`

Instante de recebimento:
`2026-09-23T01:41:18.000Z`

Hash da resposta:
`ed0c13c9e517d50376cc9a977e442912f1d1b1b751abafa6408c80f942a6d84b`

Hash do envelope:
`bc6f89317161a41e2096884b220c03928394a94a5774d1fc97fd892a87a1d1f0`

Hash do recibo custodial:
`f9929afd33f2e8a7955f894205746969dbc38bb622c7d7eae1e7f93da021b977`

## Validações feitas antes do request

O preflight do mesmo workflow validou:

- secret presente e com formato aceito;
- fingerprint esperado;
- proveniência;
- escopo;
- revisão Git;
- cofre privado;
- binding do preflight;
- confirmação humana específica.

O transporte só foi criado depois dessas verificações.

## Contrato HTTP revalidado

A documentação oficial atual continua apresentando:

- autenticação por chave recebida após cadastro/autenticação Gov.br;
- header `chave-api-dados`;
- endpoint `/api-de-dados/despesas/documentos-relacionados`;
- API REST hospedada em `api.portaldatransparencia.gov.br`.

A chave do GitHub Secret usada no run foi comparada por fingerprint com a chave do e-mail oficial mais recente e coincide byte-a-byte para fins do algoritmo canônico do ARCA.

## Estado epistemicamente correto

O ARCA registra:

`AUTHORIZATION_NOT_ESTABLISHED`

e **não** registra "token inválido provado".

Um HTTP 401 demonstra que aquela requisição não foi autorizada; isoladamente não demonstra a causa do problema.

## Perguntas para suporte técnico

1. A chave associada ao cadastro recebido em `2026-09-23T01:41:18.000Z` está ativa no backend?
2. Há atraso de ativação, revogação automática ou substituição quando várias chaves são geradas em sequência?
3. O endpoint `/api-de-dados/despesas/documentos-relacionados` possui alguma regra de autenticação adicional não refletida no Swagger?
4. Existe bloqueio por origem, User-Agent, infraestrutura de nuvem ou gateway que possa resultar em HTTP 401?
5. Há um endpoint oficial recomendado para verificar a validade da chave sem consultar dados sensíveis?
6. Há identificador/código de erro interno no corpo de uma resposta 401 de 169 bytes que o suporte possa correlacionar usando o horário do request?

## Contato oficial identificado

Swagger/API: `listaapitransparencia@cgu.gov.br`

Catálogo gov.br também lista contatos da CGU para a API.

## Restrições

Não enviar ao suporte:

- token bruto;
- passphrase;
- token do cofre;
- código bruto do documento;
- envelope criptografado salvo em repositório privado, salvo se houver canal seguro e necessidade confirmada.

Se o suporte pedir o token bruto, confirmar um canal seguro e autorizado antes do envio.
