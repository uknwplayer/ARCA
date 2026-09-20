# Machine Bridge Mesh V0

## Objetivo

O Mesh V0 adiciona uma camada de roteamento federado acima do contrato Machine Bridge V3/Direct Call. O objetivo é permitir que um ARCA origine um pedido por `requestId`, atravesse um ou mais relays e alcance um endpoint capaz de executar a tarefa sem exigir que o host de origem conheça ou possua diretamente a IA, ferramenta ou servidor final.

Fluxo de referência:

```text
ARCA / Bridge A
    -> Relay A
    -> Relay B
    -> Endpoint B
    -> MachineBridgeRemoteClient / worker
    <- resultado correlacionado
```

A rota de ida é registrada em `route`; `replyRoute` é a rota inversa. O retorno V0 acontece pelo encadeamento da chamada e é explicitamente representado no resultado. Transporte assíncrono de retorno entre processos desconectados é etapa posterior.

## Envelope

`arca-mesh-envelope-v1` encapsula um `arca-remote-job-v3` sem alterar seu contrato. Campos principais:

- `requestId` obrigatório para correlação ponta a ponta;
- `originNode`;
- `requiredCapabilities` para roteamento capability-first;
- `maxHops` e `expiresAt` para limitar loops e trabalho abandonado;
- `payloadHash` do job;
- `route` e `receipts` por salto.

Cada relay adiciona um receipt encadeado por SHA-256. Isso detecta alteração da rota ou do payload, mas **não fornece autenticidade criptográfica de identidade**. Assinaturas por nó, chaves e attestation pertencem a uma fase posterior.

## Descoberta V0

Cada peer anuncia:

- `nodeId`;
- capabilities locais;
- `reachableCapabilities`;
- função/adapter de encaminhamento.

O relay escolhe deterministicamente um peer não visitado capaz de alcançar todas as capabilities exigidas. V0 não implementa gossip global, DHT, reputação, custo, balanceamento, fallback entre múltiplos peers ou consenso.

`reachableCapabilities` é uma declaração de roteamento, não uma autorização. Em produção ela deverá ser alimentada pelo Capability Registry/Passport e, para capabilities sensíveis, por verificação/attestation válida.

## Segurança

O Mesh não amplia a `Action Registry` e não adiciona shell remoto. Um relay encaminha envelopes; a execução final continua sujeita ao Direct Call, worker compatível, Action Registry, capabilities, claims/leases e demais políticas existentes.

Falha fechada ocorre em:

- `requestId` ausente ou divergente;
- alteração do payload ou da cadeia de receipts;
- expiração;
- rota cíclica;
- `maxHops` excedido;
- ausência de rota compatível;
- endpoint sem capabilities requeridas;
- resultado final com `jobId`/`requestId` divergente.

Conteúdo externo nunca vira instrução executável apenas por atravessar o Mesh.

## Relação com blockchain / ledger

O V0 não é blockchain. A cadeia de receipts é um ledger por execução para integridade e auditabilidade. Uma evolução futura pode assinar receipts e agregar roots em Merkle trees; essas roots podem ser ancoradas externamente sem colocar payloads investigativos ou dados pessoais em blockchain pública.

## Prova implementada

Os testes cobrem um caminho lógico de três saltos:

```text
bridge-a -> relay-a -> relay-b -> worker-b
```

com preservação do mesmo `requestId`, roteamento por capability, rota inversa de resposta, hash do payload e receipts encadeados.

## Próximos passos

1. Capability Passport federado com anúncios assinados e expiração;
2. adapters HTTP/WebSocket/QUIC ou túnel reverso para peers remotos;
3. discovery/route selection com múltiplos candidatos e fallback;
4. receipts assinados + identidade de nó;
5. durable reply mailbox para retorno assíncrono após desconexão;
6. Review-Gated Continuation vinculada ao mesmo `requestId`;
7. quotas/custo/rate limits e proteção contra Sybil/abuso;
8. prova real entre dois hosts/repositórios independentes antes de qualquer rede pública aberta.
