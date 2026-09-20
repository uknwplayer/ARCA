# Machine Bridge — Request Correlation V1

## Objetivo

Permitir que um pedido assíncrono atravesse filas, workers e resultados duráveis sem depender do estado da interface que originou a tarefa.

## Contrato V3

`arca-remote-job-v3` pode carregar um `requestId` opcional. O identificador usa a mesma fronteira segura de nomes do protocolo V3 e, quando presente, é copiado sem alteração para o `arca-result-v1` terminal, tanto em `completed` quanto em `failed`.

```json
{
  "format": "arca-remote-job-v3",
  "protocolVersion": 3,
  "jobId": "job-example-1",
  "requestId": "req-example-1",
  "action": "worker.ping",
  "requires": [],
  "params": {"echo": "hello"}
}
```

Resultado correlacionado:

```json
{
  "format": "arca-result-v1",
  "protocolVersion": 3,
  "jobId": "job-example-1",
  "requestId": "req-example-1",
  "status": "completed"
}
```

## Propriedades

- compatível com jobs V3 antigos que não possuem `requestId`;
- `requestId` não concede capability nem autorização;
- não altera Action Registry, roteamento, claims ou leases;
- facilita adapters, Review Sync e hosts diretos a correlacionar resposta e pedido;
- não transforma o Machine Bridge em shell remoto nem concede escrita arbitrária.

## Aceitação

A mudança é coberta por testes de validação do protocolo, sucesso e falha do worker. O fixture `mb-correlation-live-001` é mantido na branch da mudança para produzir, após merge, uma execução real pelo Controller/Worker GitHub e confirmar que a correlação sobrevive ao caminho durável completo.
