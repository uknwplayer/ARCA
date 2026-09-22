# ARCA — Checkpoint 009: preparação do M4

Data: 2026-09-22. Estado: **desenho M4 para revisão; nenhuma implementação de rede nova e nenhum GET live**. Base `main`: `861014be4d10810215298a89c278f884a095bfe4`. M3 integrado nas PRs #81 e #82; CI pós-merge da documentação [35696050606](https://github.com/uknwplayer/ARCA/actions/runs/35696050606) verde. Edge Steward PR #78 continua congelada.

## O que foi decidido/proposto

O desenho em `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md` separa cada fonte em um ciclo. A aquisição PNCP controlada com custódia privada já foi provada no histórico AP 002, mas não representa aquisição financeira. O primeiro Portal live proposto usa API pontual por um código de documento real explicitamente selecionado e token privado; o CSV completo de despesas fica para outro gate devido a volume e layout real ainda não validado. Um pagamento pode afetar vários empenhos, mas a fixture M1/M3 não prova o esquema da resposta real. Acesso da API Portal cobre despesas federais; UF de gasto estadual/municipal exige outra evidência/fonte.

## Próximos passos para chat comum

1. Ler este checkpoint, o desenho M4, `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_008.md` e o roadmap.
2. Revisar o desenho e produzir plano de implementação com contratos exatos do Swagger oficial; não inventar cabeçalhos ou parâmetros. Implementar preflight, allowlist, orçamento de bytes, transporte fake, custódia durável e workflow manual em PR sem executar rede live.
3. Testar falha antes do GET quando falta autorização, token, cofre, código do documento ou orçamento; testar um GET no caminho positivo, ausência de retry, sanitização e limpeza; CI Node 22.18 + fronteira pública.
4. Após código revisado, preencher manifesto *concreto* com fonte, documento ou UF/data/modalidade, endpoint, timeout, teto e revisão; conferir cofre. Só então obter autorização específica e executar no máximo um GET. Registrar sucesso, vazio ou falha sem transformar ausência em suspeita.
5. Fechar M4 com recibo e checkpoint; M5, correlação live, permanece bloqueado até custódia e vínculo documental real comprovados.

Paradas: desvio de escopo, indisponibilidade sem classificação clara, resposta além do teto, segredo em log/URL/artefato, custódia incompleta, parse sem esquema verificado ou tentativa de publicar. Nenhum município é padrão.
