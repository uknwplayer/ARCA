# ARCA — Vince Discovery Global e Connectivity Investigator V0.1

Estado: **PLANEJADO / NÃO ATIVO / NÃO COMPETE COM M5**.

## Objetivo

Permitir que Vince procure globalmente recursos úteis ao ARCA:

- agents;
- workers;
- runners;
- modelos/serviços de IA;
- APIs públicas;
- servidores de computação;
- protocolos de interoperabilidade;
- documentação técnica;
- transportes e superfícies de execução.

A descoberta é mundial e **não possui exclusão geográfica**. A China está explicitamente incluída, assim como demais países e ecossistemas tecnológicos.

## China e ecossistemas estrangeiros

Vince poderá futuramente pesquisar serviços, runtimes, projetos open source, APIs, agentes, runners e infraestrutura chinesa quando:

- a superfície for pública;
- o uso for legítimo;
- a conexão for explicitamente permitida ou allowlisted;
- os termos técnicos e jurídicos aplicáveis forem respeitados;
- o recurso puder ser isolado/testado antes de admissão.

A origem geográfica não aumenta nem reduz confiança automaticamente.

## Descoberta não significa confiança

Fluxo futuro:

```text
descoberta
  ↓
identidade/descriptor
  ↓
capabilities
  ↓
política e restrições
  ↓
teste isolado
  ↓
evidência
  ↓
revisão/admissão
  ↓
worker/agent candidato
```

Nenhum serviço encontrado ganha trust, credenciais, escrita canônica ou execução privilegiada só por ter sido descoberto.

## Connectivity Investigator

Quando uma integração falhar, Vince poderá futuramente investigar por caminhos legítimos:

- documentação oficial;
- mudanças de endpoint;
- headers;
- formatos de token;
- fluxos OAuth/API key;
- exemplos oficiais;
- status do serviço;
- APIs públicas equivalentes;
- rotas alternativas oficialmente suportadas.

Probes de rede continuam exigindo os gates aplicáveis e autorização explícita quando o sistema assim determinar.

## Limites

Proibido ao Vince:

- burlar autenticação;
- explorar vulnerabilidades para obter acesso;
- reutilizar credenciais sem autorização;
- contornar controles de acesso;
- acessar áreas protegidas por inferência;
- transformar erro 401/403 em tentativa de invasão;
- ampliar autoridade automaticamente.

No caso do Portal da Transparência, Vince pode investigar como usar a **rota oficial correta** ou descobrir alternativa pública legítima. Não pode “forçar entrada”.

## Prioridade

Este patch permanece planejado enquanto M5 for o caminho crítico. Implementação futura deve reutilizar o Atlas Técnico, policies de trust e evidência do Vince existente.
