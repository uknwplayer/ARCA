# ARCA — Roadmap Termux Chat V0.2

Data: **2026-10-03**.

Estado: **TRILHO LIMITADO ATIVO POR SOLICITAÇÃO EXPLÍCITA DO OPERADOR; NÃO REATIVA EDGE/VINCE/RUNTIME MÓVEL; NÃO ALTERA A SEQUÊNCIA INVESTIGATIVA M5**.

## Objetivo

Disponibilizar uma interface de conversa no Termux que possa abrir sem provedor externo e, quando explicitamente solicitado, usar um backend autorizado sem transformar respostas em autoridade operacional.

## TC-0 — OpenAI one-shot

Estado: **CONCLUÍDO**.

- `arca ask`;
- `OPENAI_API_KEY`;
- `--allow-external`;
- `--allow-paid-api`;
- teto monetário por request;
- sem tools/Core mutation.

## TC-1 — OpenAI multi-turno

Estado: **CONCLUÍDO**.

- `arca chat` original;
- histórico em memória;
- budget de sessão;
- `/status`, `/context`, `/clear`, `/help`, `/exit`;
- sem persistência durável.

## TC-2 — catálogo multi-provedor e offline default

Estado: **IMPLEMENTADO NO PR #217; CI DE RUNTIME `37155403202` VERDE; FECHAMENTO DOCUMENTAL/CI FINAL PENDENTE**.

Entregas:

- provider `offline` padrão;
- provider `gemini`;
- provider `openai` preservado;
- `/providers`;
- roteamento do comando `chat` em módulo dedicado;
- sessão Gemini reutilizando cliente já existente;
- testes TDD de catálogo, continuidade em memória e abertura offline;
- sem fallback automático.

Gate de aceite:

1. documentação atualizada;
2. CI do head final verde;
3. PR #217 mergeável no mesmo SHA;
4. merge;
5. CI pós-merge verde.

## TC-3 — smoke test local offline

Estado: **PENDENTE / SEM REDE**.

No Termux:

```bash
cd ~/ARCA
git pull --ff-only
npm run arca -- chat
```

Validar manualmente:

- banner `Provider: offline`;
- `/providers` lista os três provedores;
- `/status` mostra rede externa desautorizada;
- `/context` informa memória da sessão apenas;
- `/exit` encerra sem erro.

Esse gate não exige API key e não deve consumir serviço externo.

## TC-4 — smoke test Gemini opcional

Estado: **PENDENTE / SOMENTE POR DECISÃO DO OPERADOR**.

Pré-condições:

- chave própria em `GEMINI_API_KEY`;
- operador decide usar a rota externa;
- execução com `--provider gemini --allow-external`;
- uma mensagem curta;
- nenhuma ferramenta/autonomia;
- nenhuma suposição de gratuidade.

Aceite: resposta textual + histórico de um segundo turno, sem mutação Core. Se houver erro de quota/billing/modelo, registrar o erro e parar; não fazer fallback pago.

## TC-5 — contexto ARCA opt-in/minimizado

Estado: **FUTURO / NÃO AUTORIZADO NESTE CICLO**.

Objetivo futuro: permitir anexar ao prompt somente contexto canônico explicitamente selecionado, por exemplo checkpoint atual, status de uma investigação ou trecho de roadmap.

Regras:

- opt-in;
- minimização;
- fonte e versão identificadas;
- memória cognitiva não sobrepõe estado canônico;
- sem abrir custódia privada por padrão;
- sem secrets;
- obedecer `ARCA_MEMORY_ARCHITECTURE_V0_1`.

## TC-6 — persistência de conversa

Estado: **FUTURO / CONGELADO**.

Não criar banco apenas para ter memória. Só avaliar após existir caso de uso operacional concreto e contrato compatível com a Arquitetura de Memória V0.1.

## Fora de escopo deste roadmap

- Device Agent;
- Edge Steward;
- Vince 24/7;
- shell arbitrário;
- controle geral do Android;
- chamada automática do Work;
- escolha automática de provedor pago;
- reaproveitamento da sessão do app/site ChatGPT;
- autonomia investigativa originada diretamente do chat.

## Retorno ao caminho crítico

Após TC-2 e TC-3, esta frente pode ser pausada novamente. A retomada do núcleo investigativo deve ocorrer a partir do checkpoint M5 operacional 064, sem converter o chat em nova dependência obrigatória do M5.
