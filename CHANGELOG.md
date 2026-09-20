# Changelog — ARCA Core

Todas as mudanças normativas seguem SemVer e exigem ADR e teste correspondente.

## 0.3.0 — Acquisition Adapter e cadeia de custódia

- pacote externo ao Core para captura de arquivos autorizados;
- preservação byte a byte e SHA-256 real local;
- proveniência com localizador, timestamp e declaração de acesso;
- log de custódia append-only para captura, transformação e revisão;
- projeção verificável, escrita atômica, permissões privadas e lock;
- recusa de symlink, traversal, fonte fora da raiz e excesso de tamanho;
- fila declarativa sem rede e proposta DOC com revisão humana;
- schemas, dois ADRs, especificação, CLI e 12 testes novos;
- correção dos escapes literais detectados pela primeira execução Node integral;
- append NDJSON robusto quando o registro anterior não termina em quebra de linha;
- captura real autorizada do Documento Mestre 1.3 com revisão humana aceita;
- requisito mínimo corrigido para Node.js 22.18 e workflow reproduzível do
  GitHub Actions em 22.18.0, primeira versão 22 com type stripping habilitado
  por padrão;
- edição pública higienizada: estados, exportações e relatórios de
  investigações foram retirados; testes de migração agora usam somente
  fixtures sintéticas efêmeras;
- metadados pessoais e localizadores privados foram removidos da captura-piloto
  distribuída;
- 30 testes legados preservados e 12 novos, com 42/42 aprovados.

## 0.2.0 — Workbench local e Agent Bundle

- Workbench local responsivo com visão geral, mapa SVG, inventário tipado, TRACE, conformidade, histórico e exportação;
- formulários para os 12 tipos de objeto e criação de relações sem edição manual de JSON;
- API HTTP local sem dependências externas, em loopback por padrão;
- CSP, política de origem, CSRF, limite de corpo, whitelist estática e cabeçalhos defensivos;
- concorrência otimista por `expectedEventHead`, verificada dentro do lock do Core;
- Agent Bundle independente de fornecedor com prompt e schema fechados;
- propostas de uma única operação, hashes canônicos, escrita atômica e lock de revisão;
- confirmação humana textual, detecção de proposta obsoleta e recuperação idempotente;
- evento aplicado vinculado ao revisor humano, ID e hash da proposta;
- ADRs para a fronteira Workbench/Core e para a autoridade restrita do agente;
- testes de API, segurança, adulteração, concorrência e 40 grafos pseudoaleatórios;
- preservação integral dos testes e da capacidade de migração da fundação
  0.1.0, sem distribuir os casos usados durante o desenvolvimento.

## 0.1.0 — Fundação Canônica

- primeira especificação autônoma do ARCA Core v1;
- questão `Q` como nó de primeira classe;
- evidência definida como relação `INF → PRO`;
- estado canônico portátil e schemas JSON 2020-12;
- event log NDJSON append-only com encadeamento SHA-256;
- armazenamento local com lock, permissões restritas e escrita atômica de exportações;
- operações determinísticas de criação, relação, TRACE, invalidação e reavaliação;
- migrador conservador de estados legados, validado com fixtures sintéticas
  efêmeras;
- normalização versionada de `subjects`, conclusão singular, objetos `EVD` e aliases `QUE`/`SEARCH`, com os originais preservados em extensões;
- validador com os 47 requisitos ACS-v0.1, sem converter `UNSPECIFIED` em `PASS`;
- CLI offline e demonstração simulada ponta a ponta;
- testes de reconstrução, grafo ramificado, adulteração, invalidação e CLI.

## Decisões pendentes antes de 1.0.0

- licença pública ou regime proprietário;
- ratificação final do vocabulário de relações;
- política de extensão e registro de namespaces;
- revisão humana da equivalência semântica das transformações legadas;
- auditoria semântica independente dos requisitos não automatizáveis.
