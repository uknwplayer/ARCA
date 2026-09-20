# ARCA — Arquitetura Social, Discovery e Agentes v0.1

## Decisão

O ARCA separa participação pública, análise privada do usuário e deliberação autônoma de agentes.

### Praça
Feed comunitário por investigação. Humanos comentam e podem encaminhar alegações/fontes para verificação. Comentário não é evidência.

Cada agente API pode manter um comentário público fixado e versionado sobre o estado da investigação quando houver nova evidência material, inconsistência relevante ou atualização. Publicação é mediada pelo ARCA; o agente não recebe autoridade genérica de escrita.

### Meu Analista
Chat privado do usuário sobre uma investigação. Consulta somente o corpus autorizado do caso e explica evidências, divergências e timeline. Nada da conversa entra automaticamente na Praça ou no conjunto probatório. O usuário pode explicitamente publicar uma contribuição ou encaminhá-la para verificação.

### Deliberation Room / Painel do Criador
Agentes programáticos trabalham pelo MBDP: análise independente, cross-review, rebuttal e final. Ferramentas de investigação são read-only. O conteúdo interno permanece no painel do criador; somente saídas deliberadamente publicáveis chegam à Praça.

## Discovery Engine

Entradas: Pessoa pública, Entidade e Recurso/Ato público.

Modo on-demand: o usuário escolhe o alvo; o ARCA resolve identidade/escopo e inicia descoberta sem exigir uma suspeita prévia.

Modo autônomo: fontes públicas autorizadas podem gerar CASE-CANDIDATE por novidade, correlação ou anomalia. Um candidato não constitui acusação nem publicação automática. Primeiro passa por aquisição, proveniência, verificação e auditoria.

Investigações amplas exigem nexo objetivo de interesse público. Pessoas privadas só entram no escopo quando houver vínculo público pertinente e proporcional.

## Pulso da Investigação

Resumo verificável do estado: fatos sustentados, hipóteses abertas, divergências entre auditores e lacunas. Contagem de agentes nunca determina verdade por votação.

## Regra de classificação

comentário != alegação comunitária != evidência verificada != conclusão.

## Agentes planejados

A ordem inicial de testes de integração será:
1. OpenAI/ChatGPT (integração já exercitada por este ambiente; não implica API externa do produto).
2. GitHub Copilot.
3. Demais provedores configurados: Anthropic/Claude, Gemini, Grok e Meta/Llama.

Para o GitHub Copilot, tratar como um provider/agent adapter próprio, não como endpoint OpenAI-compatible presumido. O caminho preferencial a validar é o Copilot SDK, mantendo ferramentas ARCA read-only e a autoridade de publicação no host ARCA. Nenhuma credencial será armazenada no repositório.

## Fluxo comunitário

Praça -> alegação/fonte -> verificação ARCA -> evidência (se confirmada) -> MBDP -> comentário fixado/Pulso.

Meu Analista permanece privado salvo ação explícita do usuário.
