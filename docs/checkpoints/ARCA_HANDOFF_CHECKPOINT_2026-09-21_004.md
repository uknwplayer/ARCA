# ARCA — Handoff checkpoint 2026-09-21 / 004

Estado: **M1 implementado localmente; PR e CI pendentes**

Base de entrada: `5f83ef1e31734429cef26a5840181a2fc4606d7e` (`main` após PR #75).

Branch de desenvolvimento: `feat/portal-transparencia-offline-m1`.

## Solicitação e resultado

Continuidade do ARCA nacional a partir do M0, com adaptador offline do Portal da Transparência e dois artefatos permanentes de retomada: este checkpoint e `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`. O registro contém agora PNCP e Portal da Transparência como fontes executáveis **somente em fixture offline**. As demais fontes ficam declaradas e bloqueadas.

Arquivos principais:

- `src/investigation/portal-expenses-offline-adapter.mjs`: normaliza uma linha sintética com colunas documentadas de pagamento, valida data, valor, campos e URL;
- `config/public-source-registry-v1.json`: fonte `br.portal-transparencia.download-despesas` ativa apenas em `OFFLINE_FIXTURE`, cobertura federal;
- `examples/multisource-offline-fixtures/portal-expenses-ac-al-am-v1.json`: AC e AM fictícios; AL indisponível sinteticamente;
- `src/investigation/multisource-offline-gate.mjs`: seleciona o segundo adaptador e ajusta os avisos dos agentes;
- `tests/portal-expenses-offline-adapter.test.mjs`: teste de normalização, proveniência, falhas fechadas e revisão;
- `scripts/validate-multisource-offline-gate.mjs`: valida os ensaios PNCP e Portal;
- `docs/ARCA_PORTAL_EXPENSES_OFFLINE_M1.md`: contrato, referência oficial e limitações.

## Fontes e interpretação

Catálogo oficial: `https://portaldatransparencia.gov.br/download-de-dados/despesas`.
Dicionário: `https://portaldatransparencia.gov.br/dicionario-de-dados/pagamentos`.
O Portal lista empenho, liquidação, pagamento e empenhos impactados em arquivos separados. A fixture representa apenas linhas de pagamento, sem CSV real nem bytes oficiais. O link no envelope aponta para o **catálogo** de referência, não prova que a linha sintética esteja publicada. A UF da fixture é uma partição fictícia e a origem federal não comprova territorialidade da despesa.

O envelope inclui hash bruto/normalizado, período, origem, transformação e lacunas. Não contém os dados normalizados nem a linha bruta. A referência de custódia é `fixture:sha256`, sem alegação de custódia real. Um pagamento pode afetar vários empenhos; nenhum vínculo com contratação PNCP foi inferido. Falha de fonte é lacuna sem suspeita.

## Validação nesta etapa

- testes focais de ambos os adaptadores: **14/14**;
- `npm run validate:multisource`: **PASS**; Portal: duas evidências, AL indisponível, `HUMAN_REVIEW`, rede e publicação false; digest do relatório de Portal `d33af20d7382df409032ecac0d94e24f97bd1ab6e04b02d55d05856182281bf9`;
- `npm run check:public`: **PASS**, 0 violações, 0 hits de conteúdo bloqueado;
- Executor Mesh Python: **27/27**;
- piloto investigativo controlado: **PASS**;
- `npm test` local no Node 24: **866/867**; teste Passkey antigo `creator-passkey-console.test.mjs:80` falhou por socket local `UND_ERR_SOCKET`. O mesmo caso ocorreu no M0 sob Node 24 e passou no Node 22.18 do projeto. A confirmação integral deste ciclo deve vir do CI Node 22.18.

O relatório PNCP do M0 tem digest histórico `5668cc7c4cc4c9adbd5911a6ca917b42a5611802bab1fa2b34baa17856ca2c88` no commit daquele marco. Seu digest muda neste branch porque o registro agora contém segunda fonte executável e o aviso adversarial foi generalizado; isto não representa alteração dos registros PNCP.

## Decisões permanentes

1. Arquitetura nacional com partições equivalentes; nenhum município padrão.
2. A fonte federal não substitui portais estaduais e municipais nem demonstra distribuição de gasto por UF.
3. Dados sintéticos e URL do catálogo não constituem evidência oficial de pagamento.
4. Ausência de vínculo pagamento ↔ empenho ↔ PNCP não implica desaparecimento.
5. Empenho não é pagamento; pagamento não prova entrega.
6. Agentes independentes propõem; verificação adversarial e revisão humana são obrigatórias.
7. Publicação, rede e ingresso live permanecem bloqueados neste gate.
8. Nenhum segredo, identificador pessoal real ou material bruto investigativo no repositório.
9. Nenhum novo repositório foi criado; continuar em `uknwplayer/ARCA`.

## Próximo marco executável: M2

1. Obter e documentar o contrato dos arquivos oficiais de empenhos impactados por pagamento (somente documentação pública).
2. Criar fixture **sintética** para relação um-para-muitos e pares PNCP; sem rede.
3. Definir chaves fortes para órgão, favorecido e documento, com proveniência por campo.
4. Implementar relação `CONFIRMED`, `CANDIDATE`, `CONFLICTING`, `NOT_OBSERVED`, distinguindo existência documental de equivalência contratual.
5. Exercitar casos positivo, ambíguo, conflitante e ausente; registrar divergência temporal e explicações alternativas.
6. Encaminhar interpretação para dois agentes e revisão humana, sem veredito automático; conferir orçamento, fronteira pública e CI.
7. Criar o checkpoint 005, atualizar CURRENT, roadmap e matriz; integrar só após CI.

M3 é o primeiro piloto **conjunto** PNCP + financeiro com três UFs e métricas. M4 inicia consultas live limitadas apenas após pré-condições documentadas no roadmap.

## Retomada por chat comum

1. Abrir este checkpoint, `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`, `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md` e `docs/ARCA_PORTAL_EXPENSES_OFFLINE_M1.md`.
2. Conferir `main`, PRs e Actions posteriores ao commit `5f83ef1e31734429cef26a5840181a2fc4606d7e`; não presumir que este checkpoint é o HEAD final.
3. Executar:

```bash
npm ci
node --test tests/multisource-offline-gate.test.mjs tests/portal-expenses-offline-adapter.test.mjs
npm run validate:multisource
npm test
PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v
PYTHONPATH=. python scripts/validate-investigative-roadmap.py
npm run check:public
```

4. Usar Node 22.18 conforme CI para a conclusão integral; registrar claramente o comportamento do teste Passkey no Node 24.
5. Confirmar o merge e CI do M1 antes de iniciar M2. Não fazer download live para completar os testes offline.

## Condições de parada

Parar diante de origem divergente, hash conflitante, campo extra contendo dado pessoal, fonte declarada tentando executar, atribuição territorial sem prova, pagamento tratado como contrato equivalente, lacuna convertida em suspeita, vazamento ou tentativa de publicação.
