# ARCA — Checkpoint 015: M4b integrado e pós-merge verde

Data: **2026-09-22**

Estado: **M4b INTEGRADO À `main`; CI PÓS-MERGE VERDE; PRIMEIRO GET PORTAL REAL AINDA NÃO AUTORIZADO OU EXECUTADO**

Merge canônico: `03d1465034de1151b7add59ab2b404a14f11fe72`

PR integrada: **#88 — M4b: captura Portal limitada com custódia privada (offline)**

CI pós-merge: **run 35798543860 — success**.

## Capacidades agora canônicas

- contrato oficial do endpoint Portal relacionado a documentos;
- escopo v0.2 limitado e hash-only;
- transporte Portal de uma única chamada, host/rota/query fixos;
- timeout, zero retry, redirect recusado e teto de 64 KiB;
- captura dos bytes originais antes de interpretação;
- cifragem e persistência privada durável;
- verificação de custódia e prova sanitizada;
- workflow manual de probe, não automático;
- testes sintéticos e gates públicos/custodiais verdes.

## O que M4b ainda não prova

- resposta real do Portal;
- schema real observado;
- vínculo financeiro real com uma contratação PNCP;
- correlação live;
- classificação investigativa live;
- publicação, acusação, irregularidade ou produção 24/7.

## Próximo gate

O próximo gate M4 é preparar um manifesto concreto para **um único documento** e obter autorização explícita separada para **um único GET real**. A execução deve capturar/custodiar primeiro e parar antes de correlação ou classificação.

Antes do GET devem existir: documento real escolhido por critério documental neutro, hash de escopo, revisão canônica, token privado, cofre privado válido e confirmação exata.

## Dependências externas

ChatGPT Work permanece opcional e atualmente indisponível por cota do usuário; isso não bloqueia o núcleo. Vince e Edge Steward estão no roadmap futuro e não são requisitos do primeiro probe live.
