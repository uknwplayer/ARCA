# ARCA — Handoff checkpoint 2026-09-21 / 003

Estado: **Gate Offline Multifonte V1 implementado em branch; integração pendente**

Base canônica de entrada: `54be3952d211ec3c5ae49e4ad3e8677189d3d19c`

Branch: `feat/multisource-offline-gate-v1`

PR/CI: preencher após publicação da branch.

## Solicitação atendida

Continuar o desenvolvimento nacional do ARCA sem restringi-lo ao PNCP e garantir dois artefatos de continuidade: checkpoint detalhado para o chat comum e roadmap detalhado de próximos passos.

## Mudanças implementadas

- contrato de adaptadores de fonte pública V1;
- registro inicial de oito fontes/famílias oficiais;
- PNCP offline como único adaptador executável;
- fontes futuras em `DECLARED_ONLY`, impossibilitadas de executar;
- envelope de evidência com hashes bruto/normalizado, transformação, origem, custódia, cobertura e lacunas;
- Gate Offline Multifonte V1 limitado a três UFs;
- fixture sintética `AC/AL/AM`;
- indisponibilidade sintética de `AL` isolada e sem suspeita;
- deduplicação de três observações em duas evidências;
- analista de proveniência e analista de comparabilidade independentes;
- verificação adversarial e encaminhamento a `HUMAN_REVIEW`;
- rede e publicação bloqueadas;
- schemas, testes, validador, documentação, CI e roadmap.

## Teste focal executado

```text
node --test tests/multisource-offline-gate.test.mjs
9 testes; 9 aprovados; 0 falhas

node scripts/validate-multisource-offline-gate.mjs
AC/AM disponíveis; AL indisponível; 2 evidências; 2 agentes;
ADVANCE_TO_HUMAN_REVIEW; rede=false; publicação=false
```

Digest local do relatório controlado: `5668cc7c4cc4c9adbd5911a6ca917b42a5611802bab1fa2b34baa17856ca2c88`.

## Validação integral local

- Node `22.18.0`: **862/862 aprovados**, incluindo os 9 testes novos;
- Executor Mesh Python: **27/27 aprovados**;
- piloto investigativo controlado: **PASS**;
- `npm run validate:multisource`: **PASS**;
- `npm run check:public`: **PASS**;
- fronteira pública: 0 violações e 0 hits de conteúdo bloqueado.

O Node 24 disponível no ambiente de trabalho fez um teste Passkey antigo falhar por `UND_ERR_SOCKET`. A repetição com Node `22.18.0`, versão exigida pelo projeto e usada no CI, aprovou o arquivo isolado em 7/7 e a suíte completa em 862/862. Não alterar o Gate Multifonte ou o teste Passkey para acomodar o comportamento específico do Node 24 sem uma decisão separada de compatibilidade.

## Decisões permanentes preservadas

1. PNCP é primeiro adaptador, não o universo de dados.
2. Cobertura continua nacional; nenhum município é padrão.
3. Falha de fonte é lacuna, não suspeita.
4. Ausência de correlação não prova desaparecimento.
5. Anomalia não é irregularidade.
6. Dois agentes não substituem verificação adversarial.
7. Agentes não publicam.
8. Revisão humana é obrigatória.
9. Material bruto e segredos ficam fora do repositório público.
10. Nenhum novo repositório foi criado.

## O que ainda não foi feito

- CI remoto e merge desta branch;
- adaptador do Portal da Transparência;
- correlação real contratação/pagamento;
- execução live multifonte;
- métricas de precisão/recall;
- operação 24/7;
- WORM/Object Lock;
- interface comunitária madura.

## Próximo passo exato

Concluir CI/merge do M0. Depois iniciar M1: adaptador **offline** do Portal da Transparência, ainda sem rede, usando o mesmo envelope e promovendo a fonte de `DECLARED_ONLY` para `ACTIVE/OFFLINE_FIXTURE` somente junto com testes.

## Retomada por chat comum

1. Ler `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`.
2. Ler `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`.
3. Verificar se esta branch/PR foi integrada; consultar `main` e Actions posteriores à âncora.
4. Executar:

```bash
npm ci
node --test tests/multisource-offline-gate.test.mjs
npm run validate:multisource
npm test
PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v
PYTHONPATH=. python scripts/validate-investigative-roadmap.py
npm run check:public
```

5. Não ativar rede, Portal da Transparência, classificador live, ingresso live ou publicação para “completar” o teste.
6. Se M0 estiver verde e integrado, seguir M1 do roadmap.

## Condições de parada

Parar diante de vazamento, origem fora da allowlist, hash divergente, duplicata conflitante, fonte declarada tentando executar, falha convertida em suspeita, agente emitindo achado adverso, bypass de revisão ou tentativa de publicação.
