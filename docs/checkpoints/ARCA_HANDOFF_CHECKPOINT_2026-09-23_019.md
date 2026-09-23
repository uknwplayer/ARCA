# ARCA — Checkpoint 019: terceiro GET Portal rejeitado mesmo com token novo

Data: **2026-09-23**

Estado: **TERCEIRO GET PORTAL EXECUTADO; PREFLIGHT VERDE; NOVO TOKEN CONFIRMADO OFFLINE; API AINDA RESPONDE UNAUTHORIZED**.

Autorização: issue #104, fechada/consumida.

Run live: `35804888834`.

## Resultado

- preflight de escopo: PASS;
- preflight do backend privado de custódia: PASS;
- novo token confirmado previamente como diferente do token exposto;
- terceiro GET controlado: executado;
- Portal: `ARCA_PORTAL_HTTP_UNAUTHORIZED`;
- captura/custódia de resposta 2xx: não produzida;
- correlação/classificação/publicação: não executadas;
- autorização #104: consumida e encerrada.

## Diagnóstico

O transporte ARCA envia `chave-api-dados` exatamente como documentado oficialmente pelo Portal. O endpoint `GET /api-de-dados/despesas/documentos-relacionados` continua publicado na API oficial. Portanto, após três tentativas controladas e a terceira já com token novo, a hipótese principal deixa de ser apenas 'secret antigo' e passa a incluir requisito de ativação/validade do cadastro/chave no serviço oficial.

Não inferir falha do documento ou da custódia: o preflight passou e o erro ocorreu na autenticação HTTP.

## Próximo gate

1. revisar o cadastro/ativação da chave diretamente no Portal da Transparência;
2. confirmar se a chave recém-gerada está ativa para a API REST e vinculada ao cadastro correto;
3. se necessário, contatar o suporte/API oficial da CGU;
4. não executar quarto GET sem nova autorização explícita;
5. manter M5 parado antes de schema live/correlação até existir resposta 2xx custodial.

Nenhum quarto GET está autorizado por este checkpoint.
