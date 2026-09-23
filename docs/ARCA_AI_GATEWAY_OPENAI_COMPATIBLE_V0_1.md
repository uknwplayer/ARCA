# ARCA — AI Gateway / Provedores OpenAI-compatible V0.1

Estado: **PLANEJADO / CONGELADO ATÉ SOLICITAÇÃO EXPLÍCITA DO USUÁRIO**.

## Objetivo

Separar o núcleo do ARCA do fornecedor/modelo de IA específico.

O ARCA deverá depender de um contrato de IA, não de um único provedor.

Arquitetura conceitual:

```text
ARCA
  ↓
AI Gateway
  ↓
provedor/modelo compatível
```

## Primeira possibilidade futura

Usar diretamente a **OpenAI API** sem servidor próprio.

Nesse modelo:

- o ARCA envia requisições à API;
- a OpenAI executa o modelo;
- não é necessário manter GPU/servidor próprio;
- o custo é variável e baseado no uso da API;
- a cobrança da API é separada da assinatura do ChatGPT;
- preços/modelos disponíveis devem ser consultados novamente no momento do descongelamento.

## Contrato futuro do Gateway

Campos candidatos:

- `providerId`;
- `baseUrl`;
- `modelId`;
- `authentication`;
- `capabilities`;
- `trustLevel`;
- `latency`;
- `costPolicy`;
- `availability`;
- `jurisdiction`;
- `dataPolicy`.

Compatibilidade de protocolo não equivale a igualdade de capabilities.

Cada provider/modelo deverá declarar e/ou provar suporte a:

- texto;
- structured output;
- tools/function calling;
- streaming;
- embeddings;
- visão, se aplicável;
- janela de contexto;
- limites de taxa;
- política de dados.

## Roteamento futuro

O Gateway poderá selecionar modelos por necessidade:

```text
triagem / tarefas simples
        ↓
modelo de menor custo

análise mais difícil
        ↓
modelo mais capaz

fallback
        ↓
outro provider compatível
```

Objetivo: controlar custo e evitar dependência rígida de um único modelo.

## Custos

Não congelar valores monetários no desenho arquitetural.

A política correta é:

- consultar preços oficiais no momento da ativação;
- registrar custo estimado antes de habilitar uso automático;
- definir budget por execução/dia/mês;
- bloquear excedentes;
- medir tokens/uso por missão;
- permitir modelos mais baratos para tarefas simples;
- exigir gate específico para modelos/rotas mais caros.

## Relação com Vince

Futuramente Vince poderá descobrir e classificar providers compatíveis, mas descoberta não concede confiança.

Fluxo:

```text
discovery
  ↓
descriptor/capabilities
  ↓
probe isolado
  ↓
policy/trust
  ↓
admissão
  ↓
AI Gateway
```

## Relação com Device Agent / Runtime Local

- Device Agent: caminho preferencial para execução local no dispositivo.
- AI Gateway: camada de abstração para modelos remotos ou locais.
- Runtime Autônomo Local: permanece separado e congelado.

O mesmo Gateway poderá futuramente apontar para:

- OpenAI API;
- modelo em servidor próprio;
- modelo local;
- outro provider OpenAI-compatible.

## Regra de congelamento

Esta frente permanece **congelada até solicitação explícita do usuário**.

Nenhuma chave de API, cobrança, chamada externa, provider ou modelo deve ser configurado/ativado por inferência.

