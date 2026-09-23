# ARCA — Checkpoint 020: diagnóstico de autenticação + custódia HTTP V0.3

Data: **2026-09-23**

Estado: **TRÊS GETS PORTAL REJEITADOS POR 401; PROBE V0.3 CANÔNICO; RESPOSTAS HTTP DE ERRO FUTURAS PODEM SER CUSTODIADAS; NENHUM QUARTO GET AUTORIZADO**.

Main canônica: `d473ccf9b3d5a8ffcb9cd07e691ac427c78323c0`.

PR estrutural: #107.

CI da PR: `35805924618` — success.

CI pós-merge: `35806024751` — success.

## Evidência acumulada

- autorização #97: primeiro GET, 401;
- autorização #101: segundo GET, 401;
- autorização #104: terceiro GET, 401;
- terceiro GET já utilizou token novo confirmado offline como diferente do token anteriormente exposto;
- em todos os três casos, preflight de escopo e cofre privado passou;
- nenhuma resposta 2xx foi capturada;
- nenhuma correlação, classificação, publicação ou encaminhamento foi executado.

## Diagnóstico oficial

A documentação oficial atual define apenas a API key em header `chave-api-dados` para a autenticação da API. O cadastro atual exige autenticação Gov.br compatível e informa que o token é entregue ao e-mail cadastrado na conta Gov.br.

A partir daqui, não tratar novo 401 como problema do documento ou do pipeline investigativo. O bloqueio atual é de autenticação/ativação do serviço oficial até prova em contrário.

## Mudança V0.3

PR #107 integrou captura custodial de respostas HTTP de erro:

- transporte padrão permanece fail-closed;
- `captureHttpErrors:true` só é usado pelo probe controlado;
- 4xx/5xx respeitam teto de bytes, timeout, zero retries e redirect refusal;
- bytes são cifrados e persistidos antes de interpretação;
- prova sanitizada não contém corpo bruto, documento ou token;
- não-2xx permanece `FAILED`, nunca achado adverso;
- backend privado aceita V0.2 e V0.3;
- workflows podem preservar envelope/prova mesmo quando o passo live falha.

## Próximo gate

1. confirmar pelo fluxo oficial Gov.br/e-mail que o token usado é o token efetivamente emitido/ativo;
2. se persistir dúvida, acionar o contato técnico oficial da API/CGU;
3. somente depois registrar nova autorização explícita one-shot;
4. no próximo GET autorizado, custodiar inclusive eventual 401 sob V0.3;
5. M5 continua parado antes de schema real 2xx e correlação live.

**Nenhum quarto GET é autorizado por este checkpoint.**
