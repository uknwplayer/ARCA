# Machine Bridge — Direct Call V1

## Objetivo

Transformar o fluxo durável `enqueue -> controller -> worker -> result` em uma chamada request/response utilizável por agentes, CLIs e hosts sem depender do estado de uma interface específica.

## Contrato

`MachineBridgeRemoteClient` opera sobre qualquer transport que implemente `enqueue()` e `getResult()`.

1. valida um `arca-remote-job-v3`;
2. enfileira o job e aciona o transport quando aplicável;
3. consulta diretamente o resultado pelo `jobId`;
4. exige correspondência do `requestId` quando o pedido possui correlação;
5. retorna o resultado terminal ou falha por timeout/mismatch.

A CLI GitHub-backed é exposta por:

```text
npm run remote:call -- --repo owner/repo --action worker.ping --params '{"echo":"hello"}'
```

`remote:submit` continua disponível para fire-and-forget e agora aceita `--request-id` opcional.

## Segurança

Direct Call não amplia a Action Registry, não concede capabilities, não ignora claims/leases e não cria shell remoto. O cliente apenas compõe primitivas já autorizadas do Machine Bridge e falha fechado se o resultado não corresponder ao `jobId`/`requestId` esperado.

Os limites de espera e polling são explícitos. Um job duplicado é recusado para evitar que uma nova chamada adote silenciosamente trabalho anterior.

## Uso arquitetural

Esse perfil permite que uma IA ou ferramenta peça trabalho a outra capability e aguarde uma resposta durável, aproximando o Machine Bridge de um barramento/mensageiro entre agentes sem tornar o host de origem uma dependência de execução.
