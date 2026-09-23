# ARCA — Matriz de estado 0.4.0-rc.1

Data de corte: 2026-09-22. Referência de entrada: `d10d8516ec05c8e1c8378159ed6459da966a61fb`.

Legenda: **sim**, **parcial**, **não**. “Ao vivo” significa prova limitada e registrada; não significa produção.

| Componente | Implementado | Testado | Prova ao vivo | Produção | Evidência | Falta principal |
|---|---:|---:|---:|---:|---|---|
| Core e event store | sim | sim | n/a | parcial | suíte integral; TRACE e cadeia SHA-256 | auditoria independente |
| Workbench/Creator | sim | sim | parcial | não | testes de interface e controle | autenticação/UX comunitária/implantação |
| Protocolo de agentes e AIE | sim | sim | parcial | não | testes de capacidades, guardrails e runtime | avaliação prolongada e SLOs |
| Fila investigativa compartilhada | sim | sim | não | não | PRs #56–#57 | operação contínua e telemetria |
| Malha executora | sim | sim | sim | não | run 35539487516, 4/4 filhos | resiliência prolongada e governança |
| Observador PNCP nacional | sim | sim | parcial | não | PRs #58–#60; 27 UFs offline | agenda 24/7 e métricas reais |
| Gate Offline Multifonte V1 + M3 correlacionado | sim, fixtures sintéticas | sim | não | não | PR #81; CI 35695672043; 11 envelopes, 8 vínculos, AC/AL/AM, 2 agentes | M4: aquisição live limitada e custódia validada |
| Correlação PNCP ↔ execução financeira M2/M5-A | sim, M2 sintético + M5 gate pré-correlação | sim | não | não | PR #79 + #94; M5 pós-merge 35799032982 | duas entradas live normalizadas e custodiais |
| Portal da Transparência / captura M4b | sim, fixture + transporte + preview + custódia HTTP V0.3 | sim | parcial: 3 GETs 401; 4xx/5xx futuros custodiais | não | PR #88/#95/#99/#102/#105/#107; CI 35806024751 | confirmar token oficial ativo, obter 2xx custodial e schema real |
| Aquisição PNCP controlada | sim | sim | sim | não | runs 35544888070 e 35547609136 | expansão gradual e orçamento operacional |
| Disponibilidade da fonte | sim | sim | parcial | não | PR #71 | política de retentativa/alerta em serviço |
| Classificador de sinais | parcial | sim, sintético | não | não | fixtures e testes | precisão/recall e calibração em dados reais |
| Ingresso investigativo automático | sim, fechado por gate | sim | não | não | guardrails dos probes | primeiro piloto ponta a ponta |
| Verificação adversarial | sim | sim | parcial | não | piloto controlado e malha | prova vinculada ao PNCP ao vivo |
| Custódia criptografada | sim | sim | sim | parcial | AES-256-GCM/scrypt; provas 001/002; M4b Portal integrado | primeiro recibo Portal real; rotação e gestão operacional |
| Backend durável privado | sim | sim | sim | parcial | run 35547609136 | WORM/object-lock e retenção formal |
| Fronteira de publicação | sim | sim | parcial | não | `publication:check` | fluxo comunitário e governança |
| Publicação autônoma | proibida | sim | não | não | revisão humana obrigatória | decisão futura, não pressuposta |
| Cobertura nacional contínua | arquitetura sim | offline sim | não | não | atestado de 27 UFs | serviço sempre ativo e observabilidade |

## Verificação de corte

A execução pós-M3 [35695672043](https://github.com/uknwplayer/ARCA/actions/runs/35695672043) aprovou:

- 886 testes Node;
- 27 testes Python da malha executora;
- piloto investigativo controlado;
- Gate Offline Multifonte V1;
- Gate de correlação financeira M2 e Gate correlacionado M3;
- verificação do repositório e fronteira pública.

O validador M2 registrou um caso de cada estado (`CONFIRMED`, `CANDIDATE`, `CONFLICTING`, `NOT_OBSERVED`), rede desligada e nenhuma publicação.

## Leitura correta

O ARCA é um protótipo avançado com pilotos controlados e invariantes de segurança exercitados. Ainda não é um serviço autônomo nacional em produção. “Nacional” descreve a arquitetura e o particionamento por 27 UFs; não declara disponibilidade permanente nem que todos os municípios foram consultados ao vivo.
