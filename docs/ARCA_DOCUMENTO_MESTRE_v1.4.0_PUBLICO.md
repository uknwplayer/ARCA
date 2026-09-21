# ARCA — Documento Mestre v1.4.0 (edição pública)

Estado: **RELEASE CANDIDATE / PILOTO CONTROLADO**  
Data: **2026-09-21**

## 1. Missão

O ARCA é uma rede investigativa autônoma auditável. Ela observa registros públicos, organiza sinais em investigações canônicas compartilhadas, distribui trabalho limitado a agentes e preserva evidências, hipóteses, divergências e revisões como grafo rastreável.

A rede deve permanecer autônoma. A interface humana existe para participar da investigação: comentar, acrescentar fontes, contestar, confirmar, auditar e revisar publicação. A presença de usuários não cria cópias da mesma investigação nem determina a quantidade de agentes.

## 2. Decisão operacional

O modelo adotado é híbrido e orientado a eventos:

1. observadores e agendas detectam trabalho acionável;
2. a fila compartilhada deduplica candidatos e mantém uma investigação canônica;
3. workers acordam conforme backlog, prioridade e limites;
4. agentes especializados propõem análises e verificações;
5. o Crivo registra conflitos, lacunas e sustentação;
6. humanos podem participar durante todo o ciclo;
7. publicação permanece sujeita a revisão humana.

Dez pessoas assistindo ao mesmo caso não exigem dez agentes. O sistema escala pelo trabalho pendente e pode compartilhar atualizações em tempo real.

## 3. Escopo territorial

O PNCP é tratado em todo o território nacional. A unidade técnica de distribuição atual é a UF, com 27 shards equivalentes e capacidade de filtros adicionais. Nenhum município é default. Barueri é somente referência histórica do primeiro teste.

A cobertura nacional offline foi atestada sem rede. As provas ao vivo foram deliberadamente limitadas a um shard e uma página; portanto não demonstram varredura contínua de todos os municípios.

## 4. Arquitetura

| Domínio | Responsabilidade |
|---|---|
| Core canônico | tipos, relações, eventos, TRACE, validação e exportação |
| Controle/Creator | sessões, propostas, revisão e guardrails |
| Observação | agendas nacionais, disponibilidade de fonte e aquisição limitada |
| Investigação | fila durável, composição de agentes, verificação adversarial e reconciliação |
| Custódia | envelope criptografado, hashes, recibos e persistência durável |
| Participação humana | comentários, fontes, disputas, confirmações, auditoria e decisão de publicação |
| Publicação | material sanitizado e explicitamente revisado |

Autoridade é separada: um observador não conclui irregularidade; um agente não grava verdade canônica por conta própria; uma falha de rede não vira sinal suspeito; e nenhum resultado é publicado sem revisão.

## 5. Estado comprovado

A base de entrada do RC1 aprovou 853 testes Node e 27 testes Python. Foram registradas:

- malha Mesh006 ao vivo com quatro tarefas aceitas;
- execução nacional offline nas 27 UFs;
- aquisição PNCP controlada 001, com dez alvos e custódia criptografada;
- migração do envelope criptografado para backend durável sem decriptação;
- aquisição PNCP durável 002, com dois alvos e persistência privada antes do sucesso;
- resultados limitados de indisponibilidade da fonte e conclusão com lacunas.

Consulte a [matriz de estado](ARCA_STATUS_MATRIX_0_4_0_RC1.md) para a fronteira entre implementado, testado, provado ao vivo e pronto para produção.

## 6. Segurança e custódia

O caminho ao vivo exige confirmação explícita, escopo limitado e preflight. Bytes de origem são selados em envelope AES-256-GCM com derivação scrypt. O backend durável recebe apenas envelope criptografado e metadados sanitizados, em caminhos endereçados pelo hash.

A história Git oferece durabilidade e visibilidade de adulteração, mas não é WORM/object-lock. Segredos e credenciais permanecem fora do código e dos relatórios. O repositório público não recebe casos, material bruto, localizadores privados nem valores secretos.

## 7. Participação humana

A futura interface deve apresentar um mural de investigações canônicas e permitir:

- acompanhar agentes e linha de evidência;
- comentar com proveniência;
- propor fonte ou correção;
- confirmar ou contestar uma afirmação;
- abrir disputa e acompanhar resolução;
- participar da revisão de publicação;
- adicionar um item à fila, sujeito a deduplicação e prioridade.

O mural não pode converter popularidade em verdade nem acusações em fatos. Contribuições humanas também entram como objetos auditáveis.

## 8. Limites e alegações proibidas

Ainda não foi provado o percurso PNCP ao vivo → classificador → fila → investigação multiagente → verificação adversarial → revisão humana → publicação. Os probes ao vivo mantiveram classificador e ingresso desligados.

Não declarar:

- serviço nacional 24/7;
- prontidão de produção;
- precisão do classificador em tráfego real;
- irregularidade a partir de anomalia;
- certificação jurídica ou regulatória;
- armazenamento imutável;
- publicação autônoma.

## 9. Próximo portão recomendado

Após a consolidação RC1, executar um único piloto ponta a ponta, ainda sem publicação:

1. pré-registrar UF, janela, modalidade, página, limite, timeout e orçamento;
2. habilitar classificador somente para os itens daquele shard;
3. registrar todos os candidatos e também os não selecionados;
4. liberar ingresso apenas para candidatos acima do critério pré-registrado;
5. deduplicar na fila compartilhada;
6. designar pelo menos dois papéis independentes;
7. executar verificação adversarial;
8. submeter o pacote a revisão humana;
9. manter publicação desligada;
10. publicar apenas recibo sanitizado e métricas agregadas.

Critérios mínimos: zero segredo/material bruto público, cadeia de custódia válida, nenhuma duplicação, falha fechada, lacunas explícitas e revisão humana registrada.

## 10. Continuidade

O arquivo [`docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`](checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md) é o ponto oficial de retomada. Cada entrega material deve atualizá-lo e acrescentar um checkpoint imutável, seguindo a [política de handoff](ARCA_CHECKPOINT_HANDOFF_POLICY_V0_1.md).
