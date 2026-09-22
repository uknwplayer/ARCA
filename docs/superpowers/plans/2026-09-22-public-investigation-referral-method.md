# Public Investigation & Referral Method V0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalizar o método de investigação pública do ARCA e planejar o futuro `Referral Dossier` sem ampliar autoridade de acesso nem automatizar denúncias.

**Architecture:** Uma especificação normativa concentra o fluxo, os limites legais e o contrato conceitual do dossiê. O roadmap cria o marco dependente M5-R, enquanto os checkpoints preservam a decisão e orientam a retomada sem alterar o caminho crítico M4–M5.

**Tech Stack:** Markdown, validador Python do roadmap, verificação pública Node.js.

**Spec:** `docs/ARCA_PUBLIC_INVESTIGATION_REFERRAL_METHOD_V0_1.md`

## Global Constraints

- Trabalho exclusivamente documental; nenhum motor executável do dossiê será implementado nesta mudança.
- Investigação `public-record first` e `lawful-access only`.
- `PUBLIC_TRAIL_END` representa lacuna probatória e nunca culpa, irregularidade ou autorização para contornar acesso.
- Nenhuma denúncia, veredito, quebra de sigilo ou encaminhamento será automático.
- Revisão humana será obrigatória antes de qualquer exportação ou encaminhamento.
- O marco M5-R dependerá da cadeia correlacionada e revisada do M5.
- Dados, casos e testes futuros deverão usar material sintético e sanitizado no repositório público.

## Review Focus

- Linguagem que confunda gasto do mandato, verba eleitoral ou emenda com renda pessoal deve ser proibida pelo método.
- Ausência, indisponibilidade ou sigilo de uma fonte deve produzir `PUBLIC_TRAIL_END`, nunca inferência adversa.
- Alegações e hipóteses devem permanecer separadas de fatos documentais e achados oficiais.
- O contrato futuro deve impedir dados protegidos e identificadores desnecessários na exportação pública.
- O roadmap deve preservar M4–M5 como caminho crítico e registrar M5-R como dependência, não atalho.

---

### Task 1: Especificação normativa do método

**Files:**
- Create: `docs/ARCA_PUBLIC_INVESTIGATION_REFERRAL_METHOD_V0_1.md`

**Interfaces:**
- Consumes: `ARCA_INVESTIGATIVE_BOUNDARY_V0_1`, cadeia de custódia, taxonomia de evidência e estados de correlação existentes.
- Produces: fluxo normativo, semântica `PUBLIC_TRAIL_END`, contrato conceitual `Referral Dossier` e critérios de aceite para M5-R.

- [x] **Step 1: Escrever propósito, autoridade e não objetivos**

Registrar que o método organiza somente fontes legalmente acessíveis e não concede poder policial, acesso privado, veredito ou denúncia automática.

- [x] **Step 2: Especificar as dez etapas do fluxo**

Documentar pergunta/período, fontes oficiais, aquisição/custódia, separação econômica, normalização, relações, hipóteses concorrentes, `PUBLIC_TRAIL_END`, revisão humana e geração do dossiê.

- [x] **Step 3: Definir o contrato conceitual do dossiê**

Exigir fatos confirmados, cronologia, fontes/localizadores, hashes, relações, inconsistências, hipóteses rotuladas, lacunas, dados protegidos necessários, autoridade competente, revisão e sanitização.

- [x] **Step 4: Fixar proibições e critérios de aceite**

Proibir invasão, engenharia social, abuso de credenciais, interceptação, compra/uso de vazamentos e superação de sigilo; exigir separação epistêmica e revisão humana.

### Task 2: Inserção no roadmap

**Files:**
- Modify: `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`

**Interfaces:**
- Consumes: aceite do M5 e controles de publicação existentes.
- Produces: `M5-R — Public Investigation & Referral Dossier`, com dependências e incrementos executáveis futuros.

- [x] **Step 1: Inserir M5-R após M5**

Registrar estado documental e dependência explícita de M5 correlacionado, custódia, verificação adversarial e revisão humana.

- [x] **Step 2: Registrar incrementos futuros**

Enumerar schema/validador, renderer, controle de dados protegidos, revisão humana obrigatória, exportação pública higienizada e testes exclusivamente sintéticos.

- [x] **Step 3: Preservar limites de autorização**

Declarar que M5-R não autoriza acesso protegido, denúncia automática, veredito ou pedido autônomo de quebra de sigilo.

### Task 3: Checkpoints da decisão

**Files:**
- Create: `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_012.md`
- Modify: `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`

**Interfaces:**
- Consumes: método V0.1 e roadmap M5-R.
- Produces: registro imutável da decisão e instrução curta de retomada no checkpoint atual.

- [x] **Step 1: Criar checkpoint 012**

Registrar escopo documental, decisão, arquivos, limites, verificações, estado de PR/CI e próximo trabalho permitido.

- [x] **Step 2: Atualizar checkpoint atual sem apagar M4**

Acrescentar a decisão M5-R e manter M4b como próximo gate do caminho crítico.

### Task 4: Validar e publicar a proposta

**Files:**
- Verify: todos os arquivos alterados nas Tasks 1–3.

**Interfaces:**
- Consumes: branch documental completa.
- Produces: commit verificável e pull request para `main`.

- [x] **Step 1: Verificar termos obrigatórios e proibidos**

Run: `rg -n "PUBLIC_TRAIL_END|Referral Dossier|revisão humana|engenharia social|sigilo|M5-R" docs/ARCA_PUBLIC_INVESTIGATION_REFERRAL_METHOD_V0_1.md docs/ARCA_ROADMAP_DETALHADO_CURRENT.md docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_012.md`

Expected: cada conceito aparece no arquivo normativo e M5-R aparece no roadmap e nos checkpoints.

- [x] **Step 2: Executar o validador investigativo**

Run: `PYTHONPATH=. python scripts/validate-investigative-roadmap.py`

Expected: exit code `0`.

- [x] **Step 3: Executar a verificação pública**

Run: `npm run check:public`

Expected: exit code `0`, sem material privado ou segredo na árvore pública.

- [x] **Step 4: Revisar diff e integridade do branch**

Run: `git diff --check && git status --short && git diff --stat`

Expected: nenhuma falha de whitespace e somente os cinco documentos planejados alterados/criados.

- [ ] **Step 5: Criar commit e PR**

```bash
git add docs/ARCA_PUBLIC_INVESTIGATION_REFERRAL_METHOD_V0_1.md \
  docs/ARCA_ROADMAP_DETALHADO_CURRENT.md \
  docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md \
  docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_012.md \
  docs/superpowers/plans/2026-09-22-public-investigation-referral-method.md
git commit -m "docs(investigation): define public referral method"
git push -u origin docs/public-investigation-referral-method-v0.1
```

Abrir PR para `main` descrevendo o escopo documental, os limites legais, as verificações executadas e a inexistência de implementação executável nesta mudança.
