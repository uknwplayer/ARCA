# ADR-ARCA-0006 — Workbench como cliente sem autoridade paralela

- **Status:** aceito
- **Data:** 2026-09-14
- **Decisão:** o Workbench só consulta e submete operações ao ARCA Core; o event log continua sendo a única fonte de verdade.

## Contexto

Uma interface visual precisa validar formulários e orientar a pessoa, mas replicar regras de domínio no cliente criaria divergência entre telas, API e CLI. Também permitiria confundir estado exibido com estado canônico.

## Decisão

O navegador contém validações de usabilidade, nunca autoridade. Toda mutação usa uma operação pública do Core. Escritas em investigações existentes carregam `expectedEventHead`, verificado pelo Core dentro do lock do event log. O servidor expõe somente arquivos estáticos conhecidos e uma API local de escopo estreito.

## Consequências

- reiniciar ou substituir a interface não altera a verdade canônica;
- CLI e Workbench compartilham os mesmos invariantes;
- conflito de concorrência é explícito e exige reconciliação;
- validação visual pode ser mais restritiva, mas nunca mais permissiva que o Core;
- colaboração e autenticação futuras pertencem a outra camada.

## Alternativas rejeitadas

- banco ou snapshot próprio do Workbench como fonte de verdade;
- alteração direta de `events.ndjson` pelo servidor;
- regras epistêmicas implementadas apenas em JavaScript do navegador;
- sincronização remota obrigatória no primeiro marco visual.
