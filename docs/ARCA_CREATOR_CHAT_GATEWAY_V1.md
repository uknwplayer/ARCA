# ARCA Creator Chat Gateway V1

**Status:** adapter foundation

## Objetivo

Ligar o canal autenticado do Creator Console a `arca-primary`/Agent Gateway sem acoplar o console a OpenAI, Anthropic, Gemini, Ollama ou qualquer provider específico.

Fluxo:

```text
Creator Console
  -> Creator Control Plane (`chat.send`)
  -> Creator Chat Gateway Adapter
  -> Agent Gateway
  -> agente compatível com a capability requerida
  -> resposta correlacionada
```

O adapter não cria uma nova autoridade. Ele apenas traduz uma mensagem Creator já autorizada para `arca-agent-task-v1` e valida a resposta do Gateway.

## API

`createCreatorChatHandlerFromGateway(gateway, options)` devolve um `chatHandler` compatível com `createCreatorConsoleServer(...)`.

O Workbench também exporta `createCreatorConsoleWithGateway(...)`, que faz essa composição sem duplicar glue code no host:

```js
const gateway = createArcaAgentGateway({
  primaryHandler,
  primaryCapabilities: ["reasoning"]
});

const console = createCreatorConsoleWithGateway({
  home,
  gateway
});
```

Por padrão o adapter requer a capability `reasoning` e **não permite agentes externos**. Isso evita que uma conversa do Criador seja enviada a um provider remoto apenas porque ele está cadastrado no Registry.

Para autorizar explicitamente participantes externos já submetidos às políticas do Agent Gateway:

```js
createCreatorConsoleWithGateway({
  home,
  gateway,
  gatewayOptions: {
    allowExternal: true,
    requiredCapabilities: ["reasoning"]
  }
});
```

Mesmo com `allowExternal: true`, a conexão externa continua sujeita à política existente do Agent Gateway: network opt-in, origin allowlist/loopback, TLS para hosts não-loopback e Credential Broker quando autenticada.

## Correlação

O `requestId` do Creator Console é reutilizado como `taskId` do Agent Gateway. O adapter falha fechado se a resposta não preservar essa correlação.

A saída usa:

`arca-creator-chat-gateway-v1`

e inclui:

- `requestId`;
- capabilities requeridas;
- descriptor público do agente escolhido;
- indicador `external`;
- `humanReviewRequired: true`;
- `coreMutationPerformed: false`;
- output retornado pelo Agent Gateway.

## Minimização de contexto

O adapter não encaminha `ARCA_HOME`, paths locais, bearer token Creator ou dados da sessão para o agente selecionado.

O contexto entregue ao Agent Gateway contém somente:

- `channel: arca-creator-console`;
- `requestId`;
- identificador lógico do subject Creator.

Isso reduz vazamento acidental de detalhes do host quando um provider externo foi explicitamente autorizado.

## Autoridade

O adapter valida que a resposta do Agent Gateway:

- possui formato reconhecido;
- mantém o mesmo `requestId/taskId`;
- continua `humanReviewRequired=true`;
- declara `coreMutationPerformed=false`.

Qualquer divergência falha fechado.

O adapter não concede shell, ferramentas Machine Bridge, mutação do Core, escrita em `main`, autorização de rede ou bypass de Human Review.

## Relação com autonomia futura

Hoje o Agent Gateway pode usar `arca-primary` ou um agente externo explicitamente autorizado.

A evolução desejada é fornecer ao mesmo gateway uma capability real de `reasoning` descoberta através do Machine Bridge Mesh. Quando existir um reasoning node confiável, o Creator Console poderá continuar usando a mesma interface sem exigir que o Criador forneça uma API específica.

O transporte/provedor muda; o contrato Creator não.

## Próximos passos

1. registrar provenance/latência do provider de forma não sensível;
2. adicionar fallback capability-aware sem enviar a mesma mensagem a múltiplos providers por padrão;
3. conectar Review-Gated Continuation ao `requestId` quando a resposta exigir decisão humana;
4. posteriormente adicionar reasoning nodes do Mesh com identidade/capability verificadas;
5. manter WebAuthn/passkey como pré-requisito para qualquer Creator Console remoto.
