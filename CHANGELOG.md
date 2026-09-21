# Changelog — ARCA Core

Todas as mudanças normativas seguem SemVer e exigem ADR e teste correspondente.

## 0.4.0-rc.1 — consolidação da rede autônoma nacional

- modelo autônomo orientado a eventos, com participação humana por auditoria, comentário, contestação e revisão;
- fila investigativa compartilhada, deduplicada e com backend durável;
- malha executora limitada, reconciliada e testada entre domínios;
- observador, agenda e runner PNCP nacionais, particionados pelas 27 UFs;
- ciclo nacional offline atestado e aquisição ao vivo limitada por shard, página, itens, timeout e confirmação;
- indisponibilidade de fonte modelada como resultado explícito, com lacunas e retentativa controlada;
- envelope criptografado de custódia e persistência durável privada endereçada por conteúdo;
- provas controladas 001/002 e migração de artefato criptografado, sem publicação nem ingresso investigativo;
- fronteira de publicação sanitizada e revisão humana preservadas;
- documentação, versão e CI consolidados como release candidate;
- 853 testes Node e 27 testes Python aprovados no marco de entrada do RC1.

O RC1 não declara produção, cobertura nacional contínua nem investigação PNCP ponta a ponta. Classificador e ingresso ficaram desligados nas provas ao vivo.

### Gate Offline Multifonte V1

- contrato público de adaptadores de fonte independente do PNCP;
- registro inicial com oito fontes oficiais e somente PNCP offline executável;
- envelope de evidência com hashes bruto/normalizado, transformação, cobertura e lacunas;
- fixture sintética limitada a AC, AL e AM, incluindo indisponibilidade isolada sem geração de suspeita;
- deduplicação determinística, dois papéis analíticos independentes e verificação adversarial;
- encaminhamento apenas à revisão humana, com rede e publicação bloqueadas;
- roadmap detalhado e checkpoint de continuidade obrigatórios.

## 0.3.0 — Acquisition Adapter e cadeia de custódia

- pacote externo ao Core para captura de arquivos autorizados;
- preservação byte a byte e SHA-256 real local;
- proveniência, custódia append-only, captura autorizada e 42 testes no marco original.

## 0.2.0 — Workbench local e Agent Bundle

- Workbench local, API defensiva e protocolo de propostas com confirmação humana.

## 0.1.0 — Fundação Canônica

- grafo, event log encadeado, TRACE, validação, migração conservadora e CLI offline.

## Decisões pendentes antes de 1.0.0

- política estável de namespaces e compatibilidade;
- auditoria semântica independente;
- métricas de qualidade em piloto real;
- modelo operacional contínuo, observabilidade e retenção imutável.
