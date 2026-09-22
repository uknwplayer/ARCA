# ARCA — Checkpoint 012: método de investigação pública e M5-R aprovados

Data: **2026-09-22**

Estado: **DECISÃO DOCUMENTAL IMPLEMENTADA EM BRANCH; MOTOR M5-R NÃO IMPLEMENTADO**

Branch: `docs/public-investigation-referral-method-v0.1`

Base da branch: `9224471ea4b3d3bbad5ebd2888a5862f6fe66f11`

PR: [#87 — docs(investigation): define public referral method V0.1](https://github.com/uknwplayer/ARCA/pull/87)

Commit remoto: [`98eccf5`](https://github.com/uknwplayer/ARCA/commit/98eccf568567bca8a00d0cc58d509cb3bc0b9081)

CI da PR: [35785679530](https://github.com/uknwplayer/ARCA/actions/runs/35785679530) — **verde**

## 1. Decisão do Criador

O Criador aprovou formalizar no ARCA o método usado para levantar valores públicos, separar a natureza dos recursos, preservar fontes e limitações e transformar o fim da trilha pública em um dossiê técnico de encaminhamento.

A decisão não concede ao ARCA poder de polícia nem autoridade para acessar dados protegidos. O método deve aprofundar legalmente a investigação pública, mostrar exatamente onde a evidência termina e permitir que um humano encaminhe material revisado à classe de autoridade competente.

## 2. Entregas documentais

1. `docs/ARCA_PUBLIC_INVESTIGATION_REFERRAL_METHOD_V0_1.md`:
   - regra `public-record first` e `lawful-access only`;
   - dez etapas do fluxo investigativo;
   - separação entre remuneração pessoal, gabinete, equipe, campanha, emenda, contratação e patrimônio declarado;
   - normalização de estornos, duplicidades e períodos parciais;
   - relações verificáveis, hipóteses concorrentes e contraprovas;
   - estado `PUBLIC_TRAIL_END`;
   - revisão humana obrigatória;
   - contrato conceitual do `Referral Dossier`;
   - proibições operacionais e critérios de aceite futuros.
2. `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`:
   - novo marco `M5-R — Public Investigation & Referral Dossier`;
   - dependência explícita do aceite de M5;
   - implementação futura incremental;
   - M4b preservado como próximo gate do caminho crítico.
3. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`:
   - decisão resumida para retomadas de contexto limitado;
   - referência a este checkpoint imutável e ao método V0.1.
4. `docs/superpowers/plans/2026-09-22-public-investigation-referral-method.md`:
   - plano executado e critérios de verificação.

## 3. Fluxo aprovado

1. delimitar pergunta, período, território, entidades e finalidade;
2. priorizar fontes oficiais e mapear cobertura;
3. adquirir dentro da fronteira legal e preservar cadeia de custódia;
4. separar a natureza econômica e institucional dos valores;
5. normalizar, reconciliar estornos e impedir dupla contagem;
6. construir relações com suporte e contraprova;
7. formular hipóteses concorrentes e critérios de confirmação/refutação;
8. registrar `PUBLIC_TRAIL_END` quando a próxima questão depender de dado indisponível ou protegido;
9. exigir revisão humana;
10. gerar `Referral Dossier` sanitizado e reproduzível.

## 4. Semântica vinculante de `PUBLIC_TRAIL_END`

`PUBLIC_TRAIL_END` significa que a trilha legalmente acessível terminou dentro do escopo registrado. É uma lacuna probatória, não indício de culpa, irregularidade ou justificativa para elevar score reputacional.

O registro deve explicar as fontes consultadas, a razão de parada, a classe mínima do dado necessário, sua finalidade probatória e a classe de autoridade ou custodiante potencialmente competente. Ele não contém o dado protegido nem autoriza sua obtenção.

## 5. Limites preservados

Continuam proibidos:

- invasão ou exploração de vulnerabilidade;
- phishing, pretexting, impersonação ou engenharia social;
- obtenção, reutilização ou abuso de credenciais;
- interceptação de comunicação, tráfego ou localização;
- compra, troca ou uso operacional de vazamentos privados;
- indução de terceiros a violar sigilo;
- tentativa de superar controles de acesso ou sigilo fora das vias legais;
- acusação, denúncia, publicação, protocolo ou pedido coercitivo automático.

Ausência, indisponibilidade, cobertura parcial e sigilo não constituem prova adversa. Recursos de gabinete, campanha, emenda, equipe ou fornecedores não podem ser atribuídos como renda pessoal sem prova documental específica.

## 6. Estado de implementação

Esta mudança é exclusivamente documental.

Ainda não existem:

- schema executável do dossiê;
- validador de `PUBLIC_TRAIL_END`;
- renderer do dossiê;
- roteador institucional;
- exportação M5-R;
- protocolo ou envio a autoridade;
- teste com pessoa, caso ou dado real.

O repositório público deve usar apenas fixtures e casos sintéticos quando a implementação começar.

## 7. Verificações locais

Linha de base antes da mudança:

- `npm test`: **891/892** no Node `v24.19.0`;
- única falha: `tests/creator-passkey-console.test.mjs`, `UND_ERR_SOCKET`;
- a falha já estava documentada no checkpoint 011 para o ambiente Node 24 e não é causada por esta mudança documental;
- a CI canônica anterior em Node 22.18 estava verde.

Verificações executadas:

```bash
PYTHONPATH=. python scripts/validate-investigative-roadmap.py
npm run check:public
git diff --check
```

Resultados:

- validador investigativo: `PASS`;
- verificação pública: `PASS`, zero violações;
- `git diff --check`: `PASS`;
- CI canônica Node 22.18: `PASS` no run 35785679530;
- PR #87 aberta, mergeável e não mesclada;
- nenhuma publicação operacional, denúncia, protocolo ou aquisição de dados foi executada.

## 8. Sequência futura autorizada

1. manter M4b como próximo gate do núcleo investigativo;
2. concluir M4 sem ampliar acesso por inferência;
3. executar e aceitar M5 correlacionado com custódia, dois agentes, verificação adversarial e revisão humana;
4. somente depois iniciar M5-R por schema e validador sintéticos;
5. implementar renderer, controle de dados protegidos e gate humano;
6. provar exportação higienizada sem protocolo automático.

## 9. Condições de parada

Parar se houver tentativa de:

- iniciar M5-R antes do aceite de M5;
- tratar `PUBLIC_TRAIL_END` como suspeita;
- importar dado real protegido para fixture ou repositório;
- converter hipótese ou relação candidata em fato;
- exportar sem revisão humana;
- automatizar denúncia, publicação, protocolo ou quebra de sigilo.

## 10. Retomada

Ler, nesta ordem:

1. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`;
2. este checkpoint 012;
3. `docs/ARCA_PUBLIC_INVESTIGATION_REFERRAL_METHOD_V0_1.md`;
4. `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`;
5. checkpoint 011 e `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md` para o trabalho imediato M4b.

Não implementar M5-R como atalho. O próximo trabalho executável continua sendo o gate M4b já condicionado ao contrato oficial e à autorização explícita de rede.
