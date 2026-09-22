# ARCA — Checkpoint 011: M4a integrado, próximo M4b

Data: 2026-09-22. Estado canônico: M4a offline integrado à `main` pelo [PR #84](https://github.com/uknwplayer/ARCA/pull/84), commit `d36df26a45d736f1fdc605721426b3a8b228d4ba`. CI da PR [35745211122](https://github.com/uknwplayer/ARCA/actions/runs/35745211122) e CI pós-merge [35745354987](https://github.com/uknwplayer/ARCA/actions/runs/35745354987): `success` no Node 22.18, incluindo suíte integral, Python Executor Mesh, piloto investigativo, gates M0–M3 e verificação pública. No pós-merge, apenas as etapas de prévia pública foram ignoradas pela condição do workflow; o job concluiu com sucesso. O PR documental que adiciona este checkpoint deve ser verificado separadamente. Desenho inicial: PR #83, commit `f5705d6f72672c184d10c983f870a9a0d70efee4`.

## Entrega e limites exatos

- `src/investigation/m4-controlled-scope.mjs` exporta `buildM4ControlledScope`. Exige uma fonte (`PNCP` ou `PORTAL`), confirmação textual específica, revisão em hexadecimal de 40 caracteres, campos estritos, limites de bytes e tempo, página 1 e zero retry. PNCP exige UF, data válida e modalidade; não existe município padrão. Portal exige código documental explícito, mas grava apenas SHA-256 desse código no manifesto. Campos extras, inclusive segredo, falham. O resultado fixa `networkAuthorizedForThisManifest:false` e `publicationAttempted:false`.
- `src/machine-bridge/durable-private-custody.mjs` reconhece o esquema **futuro** `arca.portal-controlled-live-probe.v0.1` em recibos privados criptografados, condicionado à revisão humana e aos bloqueios de classificação, ingresso e publicação. Um recibo Portal adiciona `proofSchema`; recibos PNCP preservam sua forma anterior. Isso é um contrato de validação, sem produtor de prova Portal ou captura HTTP.
- `tests/m4-controlled-scope.test.mjs` e `tests/durable-private-custody.test.mjs` cobrem aceitação, rejeições, privacidade e compatibilidade PNCP (10/10 focais). A verificação pública local passou com zero violações. O `npm test` local em Node 24.19.0 teve 891/892: um teste Passkey preexistente falhou com `UND_ERR_SOCKET`; CI Node 22.18 passou integralmente.
- Não há transporte Portal, token fornecido, endpoint validado de ponta a ponta, workflow live, GET novo, dado real Portal, classificação live nem publicação. **M4 continua incompleto.** A prova privada PNCP anterior não é prova de execução live Portal. Edge Steward PR #78 continua draft e congelado até o núcleo investigativo estar online.

## Continuidade para o chat comum — executar M4b

1. Atualizar `main`, conferir `d36df26` ou sucessor e ler este arquivo, `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`, `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md`, `docs/superpowers/plans/2026-09-22-m4-preflight-and-custody.md` e o checkpoint histórico 010. Inspecionar `src/investigation/m4-controlled-scope.mjs`, `src/machine-bridge/durable-private-custody.mjs` e seus testes. Não reinterpretar o manifesto M4a como autorização de rede.
2. Validar na documentação oficial do Portal da Transparência o endpoint preciso de consulta pontual dos empenhos impactados por pagamento: caminho, método, token, parâmetros, paginação e esquema de resposta. Registrar URL, versão/data e lacunas verificáveis em desenho M4b. O Swagger exato não foi recuperado no M4a; não inventar campos nem enviar token por URL/log.
3. Criar plano M4b separado. Primeiro escrever testes RED com fake fetch para URL exata, cabeçalho de autenticação, resposta parcial/maior que 64 KiB, timeout <=30 s, um único pedido, zero retry, token ausente, status inesperado, código divergente e redirecionamento. Depois implementar somente o cliente pontual e normalização mínima, sem inferir irregularidade.
4. Encadear captura bruta privada → criptografia → persistência durável e recibo vinculado → leitura verificadora, com falha fechada antes de qualquer agente, correlação ou publicação. Usar backend privado existente; documentar retenção e evidência sanitizada. Criar workflow manual desativado por padrão e repetir testes/validadores/CI Node 22.18.
5. Só após código revisado, CI verde e cofre pronto, montar escopo concreto com fonte, documento real em canal privado, revisão, orçamento, data e operador. Obter autorização explícita específica para **um** GET live antes da execução. Em qualquer divergência de contrato, segredo, orçamento, custódia ou escopo, parar sem chamada. Não iniciar PNCP e Portal juntos nem usar município padrão. Descrever indisponibilidade como lacuna, nunca como suspeita.
6. Após o primeiro live isolado, registrar SHA, PR, CI da PR e pós-merge, digest/recibo sanitizado, contagem de registros, lacunas, limites, incidentes e próxima ação em novo checkpoint numerado e neste arquivo CURRENT. Em M5, só então considerar correlação live com dois agentes, verificação adversarial e revisão humana.

## Comandos de verificação na retomada

```bash
git fetch origin main
git log -1 --format='%H %s' origin/main
npm ci
node --test tests/m4-controlled-scope.test.mjs tests/durable-private-custody.test.mjs
npm run validate:multisource
npm run validate:financial-correlation
npm run validate:multisource-correlated
PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v
PYTHONPATH=. python scripts/validate-investigative-roadmap.py
npm run check:public
npm test
```

No CI do GitHub verificar o job Node 22.18 e todas as etapas; executar `npm test` local Node 24 pode reproduzir o erro Passkey acima. Não elevar o escopo da execução por causa de um teste intermitente. A cobertura nacional PNCP deve avançar por UFs com orçamento e lacunas explícitos; a API de despesas federais do Portal não substitui conectores estaduais e municipais.
