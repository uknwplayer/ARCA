# Machine Bridge Mesh Mailbox V0

## Objetivo

O Mesh Mailbox V0 transforma o roteamento lógico do `Mesh V0` em um caminho durável e reativável. Em vez de exigir que todos os relays permaneçam conectados na mesma chamada, cada salto pode ser persistido em GitHub e acordar outro nó por `repository_dispatch`.

Fluxo de prova planejado:

```text
ARCA / origem
  -> remote-mesh/queues/mesh-relay-a/<requestId>.json
  -> workflow mesh-relay-a
  -> remote-mesh/queues/mesh-relay-b/<requestId>.json
  -> workflow mesh-relay-b
  -> Direct Call V1
  -> canonical Machine Bridge worker
  -> remote-mesh/results/<requestId>.json
  -> origem
```

O mesmo `requestId` permanece em todos os saltos. A fila e o resultado terminal sobrevivem ao encerramento da interface que originou o pedido.

## Componentes

### `GitHubMeshMailboxTransport`

Fornece:

- registro de nós em `remote-mesh/nodes/`;
- filas por nó em `remote-mesh/queues/<nodeId>/`;
- claims com lease em `remote-mesh/claims/<nodeId>/`;
- resultado terminal compartilhado em `remote-mesh/results/`;
- espera bounded por resultado;
- adapter `remotePeer()` para conectar um `MachineBridgeMeshRelay` a outro nó remoto;
- `repository_dispatch` `arca_mesh_available` para acordar o destino.

### Runtime de nó

`scripts/arca-mesh-mailbox-node.mjs` processa um envelope durável em modo:

- `relay`: encaminha para outro nó remoto e aguarda o resultado terminal;
- `gateway`: liga o Mesh ao `MachineBridgeRemoteClient`, preservando Action Registry, capabilities, claims/leases e worker V3 existentes.

### Workflow fechado

`.github/workflows/arca-machine-bridge-mesh.yml` contém uma topologia de prova explicitamente allowlisted:

```text
mesh-relay-a -> mesh-relay-b -> github-actions-worker
```

O workflow aceita somente `target_ref=arca-runtime` e somente os dois IDs de relay definidos. O endpoint final anuncia as mesmas capabilities do worker canônico atual (`node`, `repository`, `aie`, `pncp-plan`).

## Propriedade 24/7

A durabilidade não depende de uma conversa ChatGPT aberta. Se uma execução ou interface desaparecer, os envelopes, claims e resultados permanecem no mailbox. Um nó compatível pode ser acordado novamente e continuar pelo mesmo `requestId`.

Isso ainda não equivale a uma rede pública descentralizada completa: GitHub é o rendezvous/storage da prova. A etapa seguinte é permitir que o mesmo contrato seja transportado por HTTP/WebSocket/QUIC/túnel reverso e por repositórios/hosts independentes.

## Segurança

- o workflow usa implementação canônica de `main`, mas lê/escreve o mailbox operacional em `arca-runtime`;
- a topologia V0 é fechada; nenhum node ID arbitrário é executado;
- o mailbox não transforma payload externo em shell/comando;
- Action Registry continua sendo a fronteira final de execução;
- claims reduzem processamento concorrente duplicado;
- resultados continuam sujeitos à correlação `jobId`/`requestId` e ao hash/route contract do Mesh;
- capability advertisement continua separado de autorização;
- o GitHub token não é persistido em envelopes/resultados.

## Limitações conscientes

- identidade de nó ainda não é assinada criptograficamente;
- `repository_dispatch` e GitHub Actions ainda são o plano de controle da prova;
- não existe discovery global/gossip/DHT;
- não existe reputação/Sybil resistance;
- não existe billing/crédito de computação;
- não existe fallback multi-provider;
- Review-Gated Continuation ainda precisa ser acoplada ao fluxo terminal antes de resultados sensíveis poderem autorizar continuação automática.

## Próximo marco

Executar um probe real em `main` com `worker.ping`, exigindo capability `node`, e confirmar a cadeia completa:

```text
mesh-relay-a -> mesh-relay-b -> github-actions-worker -> result
```

Depois disso, separar os dois relays em hosts/repositórios independentes sem alterar o envelope Mesh.
