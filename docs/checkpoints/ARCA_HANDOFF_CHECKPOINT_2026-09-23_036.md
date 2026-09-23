# ARCA — Checkpoint 036: Atlas Técnico Vivo, pt-BR e Vince Discovery Global

Data: **2026-09-23**.

Estado: **DECISÕES TRANSVERSAIS DOCUMENTADAS; M5 CONTINUA CAMINHO CRÍTICO; NENHUMA NOVA REDE/EXECUÇÃO ATIVADA**.

## Entregas

1. `docs/ARCA_ATLAS_TECNICO_VIVO_V0_1.md`
2. `docs/atlas/ARCA_ATLAS_COMPONENTES_V0_1.json`
3. `docs/ARCA_POLITICA_IDIOMA_PT_BR.md`
4. `docs/ARCA_VINCE_DISCOVERY_GLOBAL_V0_1.md`

## Atlas Técnico Vivo

O Atlas passa a ser o mapa interno canônico do ARCA para componentes, dependências, entradas/saídas, capabilities, limites, health checks, modos de falha, recuperação, fallback, risco de reexecução e runbooks.

Mudança arquitetural significativa deve atualizar o Atlas antes de ser considerada documentalmente concluída.

## Idioma oficial

Português brasileiro (pt-BR) é o padrão obrigatório para conteúdo humano novo ou significativamente alterado.

Exceções somente por compatibilidade técnica: nomes oficiais, identificadores, campos de API/protocolo, mensagens exatas de erro e código. Históricos em inglês migram gradualmente quando tocados.

## Vince Discovery Global

Capacidade futura, não ativa, para descoberta mundial de agents/workers/runners/APIs/IA/infraestrutura, incluindo ecossistemas chineses.

Regras:
- origem geográfica não equivale a trust;
- apenas superfícies públicas, allowlisted ou explicitamente conectadas;
- discovery não concede admissão;
- teste isolado e evidência antes de integração;
- nenhuma evasão de autenticação ou exploração.

Connectivity Investigator poderá futuramente pesquisar rotas oficiais para integrações que falham. No Portal da Transparência, isso significa procurar documentação/endpoint/autenticação/alternativa pública legítima, nunca forçar acesso.

## Prioridade

M5 permanece o caminho crítico. Vince Probe 011, Edge Steward e Controlled Self-Improvement permanecem congelados conforme decisões vigentes.
