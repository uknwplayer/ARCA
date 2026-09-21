# ARCA — Handoff checkpoint 2026-09-21 / 001

Checkpoint: **2026-09-21 / consolidação RC1 em preparação**  
Base canônica: `2ebd92fb4b53ff3045da1cb258403c49537f61d2`  
Branch de trabalho: `docs/arca-0-4-0-rc1-consolidation`

## Estado resumido

O ARCA é um protótipo avançado orientado a eventos, com fila compartilhada, malha executora, observação PNCP nacional e custódia durável controlada. Não é produção. A consolidação 0.4.0-rc.1 corrige a documentação 0.3.0 defasada e estabelece uma regra permanente de handoff.

## Decisões que não devem ser revertidas sem decisão explícita

- autonomia da rede é invariante;
- humanos auditam, comentam, ajudam, contestam e revisam;
- workers escalam por trabalho acionável, não por usuários conectados;
- uma investigação canônica é compartilhada e deduplicada;
- PNCP cobre arquitetura nacional em 27 UFs; nenhum município é padrão;
- o município do primeiro teste é somente origem histórica de teste;
- indisponibilidade da fonte é lacuna operacional, não indício;
- publicação exige revisão humana.

## Evidência pública de entrada

- PRs #56–#57: fila e backend durável;
- PRs #58–#60: observador, agenda e runner nacionais;
- PR #61: atestado offline das 27 UFs;
- PRs #62–#67: envelope, prova ao vivo 001 e migração durável;
- PRs #68–#71: diagnósticos, prova durável 002 e disponibilidade da fonte;
- CI [35548063705](https://github.com/uknwplayer/ARCA/actions/runs/35548063705): 853 Node + 27 Python aprovados;
- Mesh006 [35539487516](https://github.com/uknwplayer/ARCA/actions/runs/35539487516);
- PNCP 001 [35544888070](https://github.com/uknwplayer/ARCA/actions/runs/35544888070);
- migração [35546194827](https://github.com/uknwplayer/ARCA/actions/runs/35546194827);
- PNCP durável 002 [35547609136](https://github.com/uknwplayer/ARCA/actions/runs/35547609136).

## Trabalho desta consolidação

- versão raiz e CI para 0.4.0-rc.1;
- README atual;
- Changelog RC1;
- Documento Mestre v1.4.0;
- matriz de maturidade;
- correção do status da custódia durável;
- política de checkpoint público/privado.

## Limites

Não houve prova ponta a ponta com classificador e ingresso ativos. Não afirmar produção, 24/7, precisão real, varredura ao vivo de todos os municípios, WORM, publicação autônoma ou irregularidade.

## Retomada imediata

1. verificar o SHA de `main` e as PRs mais recentes;
2. confirmar a situação desta branch/PR de consolidação;
3. executar `npm ci`, `npm test`, testes Python, piloto controlado e `npm run check:public`;
4. integrar somente com CI verde;
5. abrir checkpoint final curto registrando SHA do merge e CI pós-merge;
6. atualizar a camada operacional privada;
7. então preparar o primeiro piloto ponta a ponta, com publicação desligada.

## Próximo desenvolvimento recomendado

Desenhar e testar o gate de piloto PNCP ponta a ponta: um shard, uma página, limite pequeno, classificador e ingresso opt-in, deduplicação, dois papéis independentes, revisão humana e nenhuma publicação. Qualquer uso de rede ou credencial deve permanecer explicitamente limitado e auditável.
