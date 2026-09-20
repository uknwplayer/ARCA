# Machine Bridge — Review-Gated Continuation V1

**Status:** agent-layer orchestration foundation

## Problema

Um resultado Machine Bridge com `status=completed` significa somente que a execução técnica terminou. Isso não significa que o conteúdo foi aprovado para uso substantivo.

Quando o produtor marca `humanReviewRequired`, o sistema precisa separar duas dimensões:

```text
execution state: completed
review state: pending | approved | rejected | needs-more-information
```

Sem essa separação, um orquestrador pode interpretar `completed` como autorização e continuar automaticamente com um resultado que ainda estava esperando decisão humana.

## Contrato V1

`ReviewGatedContinuation` vive na camada Agent e compõe:

- um resultado terminal Machine Bridge;
- `requestId` durável;
- `materializeMachineBridgeReviews(...)`;
- `HumanReviewQueue`;
- uma política explícita de liberação.

Ele não modifica o formato nem o status do resultado técnico original.

## Estados do gate

`arca-review-gate-v1` pode produzir:

- `authorized-to-continue` — nenhuma barreira foi materializada ou todas as barreiras foram aprovadas;
- `awaiting-human-review` — existe ao menos um item pendente;
- `blocked` — ao menos uma revisão rejeitou o uso;
- `needs-more-information` — revisão exige nova informação;
- `manual-policy-required` — item foi encerrado, mas a decisão não equivale a aprovação automática na política vigente;
- `execution-failed` — execução técnica não terminou como `completed`;
- `correlation-required` — resultado técnico terminou sem `requestId` e não pode ser retomado de forma durável.

Todo snapshot expõe separadamente:

- `executed`;
- `authorizedToContinue`;
- `state`;
- `reviewIds`;
- `pendingReviewIds`;
- decisões já registradas.

## Política padrão

A política padrão é conservadora:

- `approve` autoriza;
- `reject` bloqueia;
- `needs-more-information` mantém o fluxo parado;
- `acknowledge` não é tratado como aprovação substantiva.

Um host pode optar explicitamente por `allowAcknowledge=true` para fluxos onde mera ciência seja suficiente. Isso não é o padrão.

Quando existem múltiplos itens para o mesmo `requestId`, todos precisam satisfazer a política antes da liberação.

## Correlação

A unidade lógica da continuação é o `requestId`, não o arquivo de resultado nem a sessão da UI.

Isso permite que vários jobs relacionados pertençam ao mesmo fluxo. Uma decisão humana permanece consultável mesmo se o processo que iniciou a tarefa encerrar.

O gate nunca usa a existência de uma janela do ChatGPT/Workbench como estado de execução.

## API principal

### `consumeResult(result)`

- recusa resultado malformado;
- materializa Human Reviews de forma idempotente quando necessário;
- retorna imediatamente o estado do gate.

### `status(requestId)`

Recalcula a autorização a partir da fila durável de revisão.

### `call(client, job, options)`

Compõe qualquer cliente que exponha `call(job, options)` — incluindo `MachineBridgeRemoteClient` — e retorna:

```text
executionResult
+
gate
```

O job precisa possuir `requestId`, e o resultado precisa devolver exatamente o mesmo identificador.

### `waitForDecision(requestId)`

Polling local bounded para cenários interativos. O timeout é deliberado: esperas de horas/dias devem ser retomadas por scheduler/controller/evento futuro, não por uma conexão infinita.

## Fluxo

```text
IA/Agent A
   |
   | requestId
   v
Machine Bridge / Mesh / Agent B
   |
   | technical result
   v
completed
   |
   v
Review-Gated Continuation
   |
   +--> no review ----------------------> authorized-to-continue
   |
   +--> pending ------------------------> Human Review Queue
                                            |
                       +--------------------+--------------------+
                       |                    |                    |
                     approve             reject       needs-more-information
                       |                    |                    |
                       v                    v                    v
              authorized-to-continue     blocked          collect more data
                       |
                       v
               resume same requestId
```

## Segurança

Review-Gated Continuation não:

- executa shell;
- promove `completed` para aprovação;
- altera `main`;
- altera o Core;
- decide revisão em nome de humano;
- transforma `acknowledge` em `approve` por padrão;
- guarda decisão humana em payload público do Mesh automaticamente.

A decisão continua no `HumanReviewQueue` local/durável e o resultado Machine Bridge original permanece imutável.

## Relação com Creator Console

O Creator Console já expõe a contagem de Human Reviews pendentes. Em uma etapa posterior, um usuário com `creator.review` e autenticação forte poderá revisar um item no console.

O bootstrap local atual (`creator.chat` + `creator.read`) não possui `creator.review` e portanto não deve resolver gates.

## Próximos passos

1. evento de `review.resolved` para acordar continuations sem polling;
2. store durável de DAG/continuation pointer por `requestId` sem armazenar comando arbitrário executável;
3. integrar Creator Console forte (WebAuthn) ao `creator.review`;
4. integrar Mesh para que o nó originador possa ser acordado após decisão humana;
5. definir política por `kind` de review para casos onde `acknowledge` seja suficiente;
6. manter fail-closed quando correlação, integridade ou decisão estiverem ambíguas.
