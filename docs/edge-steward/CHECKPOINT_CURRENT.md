# ARCA Edge Steward — Checkpoint Atual

Data: 2026-09-22
Fuso: America/Sao_Paulo
Status: ARQUITETURA APROVADA / PLANOS CONCLUÍDOS / IMPLEMENTAÇÃO NÃO INICIADA

Repositório atual: uknwplayer/ARCA
Branch de documentação: docs/edge-steward-v0.1
Base inicial observada: main @ 12b6f880cb34331a9f4a9b27cda2fedb7b58855e

## Missão

Criar uma presença ARCA recuperável/ativável 24/7 usando o celular Android sempre conectado do usuário, sem custo adicional obrigatório.

O celular continua sendo dispositivo pessoal prioritário.

## Arquitetura aprovada

Tela ativa:

- Steward quase ocioso;
- heartbeat;
- observação;
- recuperação;
- dispatch fechado;
- sem compute oportunista.

Tela bloqueada/desligada:

- aguardar 120 s;
- verificar bateria/térmica/memória;
- permitir apenas tarefa local-safe;
- iniciar em 15%;
- validar 25%, 35% e máximo 45%;
- desbloqueio preempta.

## Invariantes

- custo adicional zero;
- sem Tasker pago;
- helper Android mínimo e open-source;
- helper sem segredos;
- outbound-only;
- SQLite local não autoritativo;
- reutilizar Machine Bridge, Event Fabric, Autonomy Workflow e Execution Identity;
- sem protocolo paralelo;
- sem shell arbitrário;
- sem merge/main/trust authority;
- timeout não significa não execução;
- estado remoto ambíguo não autoriza duplicação automática.

## Correção do bloqueio anterior

A tentativa anterior de criar branch em uknwplayer/arca-core-v1-foundation falhou com 403.

Foi verificado posteriormente que esse repositório está arquivado.

O repositório ativo uknwplayer/ARCA possui permissão de escrita e recebeu uma branch própria para esta documentação:

docs/edge-steward-v0.1

Isso elimina a necessidade de escrever no Core legado ou reutilizar uma branch não relacionada.

## Próximo passo exato

1. revisar/aprovar o plano Native;
2. implementar contratos do Core por TDD;
3. implementar runtime móvel;
4. produzir prova integrada;
5. testar em Android real;
6. validar tiers 15/25/35/45;
7. executar soak 24/7;
8. atualizar roadmap/checkpoint a cada marco.

## Instrução de retomada

Ler nesta ordem:

1. README.md
2. ROADMAP.md
3. CHECKPOINT_CURRENT.md
4. IMPLEMENTATION_PLAN.md

Não reinterpretar 45% como meta.
Não adicionar infraestrutura paga como dependência.
Não abrir porta pública no telefone.
Não conceder merge/main/trust authority.
Não inferir não execução a partir de timeout/process death.
