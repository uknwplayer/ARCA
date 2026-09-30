# ARCA — Vince V5 Work Correlated ACK Observer

Status: **CANDIDATO / READ-ONLY / SEM WAKE / SEM DISPATCH**.

## Objetivo

Separar a observação do ACK do ato de wake.

O wake do ChatGPT Work pode ocorrer em uma superfície GitHub isolada. Este observador não cria commits,
não desperta o Work e não envia missão. Ele somente:

1. consulta comentários da PR configurada;
2. procura `WORK-WAKEUP-ACK`;
3. exige o token derivado do `wakeId`;
4. exige o SHA exato do commit de wake;
5. aplica a janela de freshness do Vince V5;
6. executa seleção de rota sem dispatch.

## Estados

Sem ACK válido e recente:

```text
INCONCLUSIVE
selectedEndpointId = null
dispatchPerformed = false
```

Com ACK válido, recente e correlacionado:

```text
AVAILABLE / RECENT_CORRELATED_ACK
selectedEndpointId = chatgpt-work
dispatchPerformed = false
```

A seleção não concede autoridade de execução. Ela apenas demonstra que, naquele instante e dentro da
janela de freshness, o endpoint possui evidência de wake observada.

## Probe 009

O wake live do Probe 009 foi pré-registrado na issue #141 e usa a PR #90 como superfície isolada.

Correlação:

- wakeId: `6e543b3226fee09143e72deaee4c18cba5d4100a58d1d5f036c261c40d49bece`
- token: `ARCA-WAKE-6E543B3226FEE09143E72DEAEE4C18CB`
- wake commit: `12899812accca1225837611f74b1c956e4acc638`

Ausência de comentário não significa endpoint indisponível. Significa somente que ACK correlacionado
não foi observado na consulta.

## Limites

- nenhuma mutação de `main`;
- nenhuma execução Termux;
- nenhuma consulta Portal/PNCP;
- nenhum fallback automático;
- nenhum merge;
- nenhum trust grant;
- nenhuma execução substantiva no Work;
- Edge Steward continua congelado.
