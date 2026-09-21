# ARCA — Handoff checkpoint 2026-09-21 / 002

Checkpoint: **2026-09-21 / RC1 consolidado**  
Estado: **PR #72 integrada; CI pós-merge verde**  
Âncora canônica da consolidação: `7ad09159d486e4616263e1e7a4830b8c4db0d820`  
CI pós-merge: [35604244525](https://github.com/uknwplayer/ARCA/actions/runs/35604244525)

## Resultado entregue

A documentação oficial e a versão raiz agora refletem o sistema existente como `0.4.0-rc.1`: protótipo avançado e piloto controlado, não produção. Foram alinhados README, Changelog, Documento Mestre v1.4.0, matriz de maturidade, status de custódia e política de checkpoint.

A PR [#72](https://github.com/uknwplayer/ARCA/pull/72) foi integrada após CI verde. A execução pós-merge aprovou 853 testes Node, 27 testes Python, o piloto investigativo controlado e a verificação do repositório/fronteira pública.

## Estado técnico atual

- Core e grafo auditável: implementados e testados.
- Workbench/Creator: funcionais localmente; não são portal comunitário de produção.
- Fila compartilhada e backend durável: implementados.
- Malha executora: prova ao vivo controlada com 4/4 tarefas aceitas.
- Observador PNCP: arquitetura nacional em 27 shards de UF.
- Scheduler/runner: ciclo offline de todas as UFs atestado.
- Aquisição ao vivo: dois probes controlados e limitados.
- Custódia: envelope criptografado e persistência privada durável provados.
- Indisponibilidade: resultado limitado, lacuna explícita e retentativa opt-in.
- Publicação: revisão humana obrigatória; material público sanitizado.
- Classificador/ingresso: testados de forma controlada, mas desligados nos probes PNCP ao vivo.

## Decisões permanentes

1. O ARCA permanece uma rede autônoma orientada a eventos.
2. Humanos observam, auditam, comentam, adicionam fontes, contestam, confirmam e revisam.
3. Workers escalam pelo backlog acionável, não pelo número de usuários conectados.
4. Usuários compartilham uma investigação canônica deduplicada.
5. O escopo PNCP é nacional; nenhum município é default. A localidade inicial é apenas origem histórica de teste.
6. Falha de transporte não produz suspeita nem investigação automática.
7. Anomalia não é irregularidade.
8. Agentes propõem; o estado canônico e a publicação atravessam gates.
9. Publicação exige revisão humana.
10. Cada entrega material termina com CURRENT + checkpoint histórico e, quando aplicável, handoff operacional privado.

## Provas e referências

| Prova | Referência | Resultado |
|---|---|---|
| Mesh006 | [run 35539487516](https://github.com/uknwplayer/ARCA/actions/runs/35539487516) | 4/4 aceitas |
| 27 UFs offline | [PR #61](https://github.com/uknwplayer/ARCA/pull/61) | 27/27, sem rede |
| PNCP controlado 001 | [run 35544888070](https://github.com/uknwplayer/ARCA/actions/runs/35544888070) | 10 alvos, ingresso off |
| Migração durável | [run 35546194827](https://github.com/uknwplayer/ARCA/actions/runs/35546194827) | sem rede/decriptação |
| PNCP durável 002 | [run 35547609136](https://github.com/uknwplayer/ARCA/actions/runs/35547609136) | 2 alvos, custódia antes do sucesso |
| Base pré-RC1 | [run 35548063705](https://github.com/uknwplayer/ARCA/actions/runs/35548063705) | 853 Node + 27 Python |
| Consolidação RC1 | [run 35604102042](https://github.com/uknwplayer/ARCA/actions/runs/35604102042) | PR e preview público verdes |
| Pós-merge RC1 | [run 35604244525](https://github.com/uknwplayer/ARCA/actions/runs/35604244525) | verde |

## O que não foi provado

Não existe ainda uma prova completa PNCP ao vivo → classificador → fila → investigação multiagente → verificação adversarial → revisão humana. Também não existem serviço 24/7, SLOs, alerta/monitoramento de produção, precisão real do classificador, interface comunitária madura, rotação formal de segredos ou armazenamento WORM/object-lock.

Não alegar cobertura nacional contínua, consulta ao vivo de todos os municípios, prontidão de produção, irregularidade, certificação jurídica, publicação autônoma ou imutabilidade física da custódia.

## Próximo trabalho recomendado

Executar um piloto ponta a ponta único, fechado e sem publicação:

1. pré-registrar uma UF, janela, modalidade, uma página, limite pequeno, timeout e orçamento;
2. exigir confirmação explícita para rede;
3. habilitar classificador somente no shard pré-registrado;
4. registrar candidatos e não selecionados para métricas;
5. habilitar ingresso somente acima do critério fixado;
6. deduplicar pela fila compartilhada;
7. atribuir ao menos dois papéis independentes;
8. executar verificação adversarial;
9. submeter a revisão humana;
10. manter publicação desligada;
11. emitir apenas recibo sanitizado e métricas agregadas.

Critérios de parada: qualquer vazamento, divergência de escopo, cadeia inválida, credencial ausente, backend não privado, ambiguidade de reexecução ou tentativa de publicação fecha o piloto sem novo acesso.

## Instruções de retomada para um chat com contexto limitado

1. Abrir este arquivo, o Documento Mestre v1.4.0 e a matriz de estado.
2. Consultar `main`, PRs posteriores à #72 e Actions posteriores ao run 35604244525; não assumir que esta âncora ainda é HEAD.
3. Rodar:
   - `npm ci`
   - `npm test`
   - `PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v`
   - `PYTHONPATH=. python scripts/validate-investigative-roadmap.py`
   - `npm run check:public`
4. Nunca copiar valores secretos, bytes/ciphertext de custódia, localizadores privados ou material bruto para documentos públicos.
5. Não ativar rede, classificador ou ingresso por inferência; usar workflow/gate explícito e escopo limitado.
6. Antes de desenvolver, verificar se há checkpoint operacional privado mais recente.
7. Ao finalizar, atualizar CURRENT e criar o próximo checkpoint histórico.
