# ARCA — Checkpoint 018: segundo GET Portal rejeitado; token ainda é o exposto

Data: **2026-09-23**

Estado: **SEGUNDO GET PORTAL EXECUTADO; PREFLIGHT VERDE; API RESPONDEU UNAUTHORIZED NOVAMENTE; TOKEN ATUAL IDENTIFICADO COMO O MESMO TOKEN PREVIAMENTE EXPOSTO**.

Autorização: issue #101, fechada/consumida.

Run live: `35803859734`.

## Resultado

- preflight de escopo: PASS;
- preflight do backend privado de custódia: PASS;
- segundo GET controlado: executado;
- Portal: `ARCA_PORTAL_HTTP_UNAUTHORIZED`;
- captura/custódia de resposta 2xx: não produzida;
- correlação/classificação/publicação: não executadas;
- autorização #101: consumida e encerrada.

## Diagnóstico sem rede

Run diagnóstico: `35803959274`.

O diagnóstico leu apenas a forma/hash do secret `ARCA_PORTAL_API_KEY`, sem revelar o valor. Resultado:

- secret presente: sim;
- comprimento: 32;
- whitespace: não;
- formato hexadecimal de 32 caracteres: sim;
- hash idêntico ao token previamente exposto na conversa: **sim**.

Portanto o secret atual não é uma chave nova. O token previamente exposto deve ser tratado como comprometido/possivelmente revogado ou inválido e não deve ser reutilizado.

## Próximo gate

1. gerar/solicitar uma chave realmente nova no Portal da Transparência;
2. substituir somente `ARCA_PORTAL_API_KEY` pelo novo valor;
3. não publicar nem enviar a nova chave em chat, issue, commit ou log;
4. opcionalmente validar apenas por diagnóstico hash/shape sem rede;
5. registrar nova autorização explícita antes de qualquer terceiro GET.

Nenhum terceiro GET está autorizado por este checkpoint.
