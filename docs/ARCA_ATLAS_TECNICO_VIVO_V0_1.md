# ARCA — Atlas Técnico Vivo V0.1

Estado: **ATIVO COMO MAPA CANÔNICO / EVOLUÇÃO CONTÍNUA**.

## Objetivo

O Atlas Técnico Vivo é o mapa interno do ARCA. Ele deve permitir que qualquer operador ou agente autorizado entenda:

- o que cada peça faz;
- onde está;
- quando atua;
- quem a chama;
- de quem depende;
- quais dados recebe e produz;
- quais permissões possui;
- como verificar se está saudável;
- como detectar falha;
- como recuperar/religar;
- quais fallbacks existem;
- quais riscos de reexecução existem;
- quais gates humanos ou de segurança impedem ações indevidas.

## Regra de atualização

Toda mudança arquitetural significativa deve atualizar o Atlas antes de ser considerada concluída.

Mudanças significativas incluem:

- novo componente;
- nova dependência;
- nova capability;
- mudança de autoridade;
- novo fluxo de dados;
- novo mecanismo de recuperação;
- novo fallback;
- mudança de armazenamento/custódia;
- mudança de autenticação;
- alteração de sequência M0–M9;
- ativação/desativação de worker/agent;
- mudança relevante no Vince ou Machine Bridge.

## Camadas

### Núcleo investigativo

- M0/M1: contratos de fonte, adapters e Evidence Envelopes;
- M2: correlação financeira;
- M3: correlação multifonte + dois agentes + verificação adversarial;
- M4: aquisição live controlada e custódia;
- M5-A: gate pré-correlação;
- M5-B: caminho pós-custódia até HUMAN_REVIEW;
- M5-R: dossiê público/encaminhamento, ainda futuro.

### Plano de execução

- Machine Bridge;
- Vince Pathfinder/Recovery;
- Termux workers;
- malha executora;
- endpoints/agentes externos futuros.

### Plano de evidência

- custódia privada;
- proveniência;
- hashes;
- contraprovas;
- states epistêmicos.

### Plano de controle

- manifests;
- budgets;
- policies;
- gates humanos;
- publicação sanitizada.

### Recuperação

- checkpoints;
- replay protection;
- failover reconciliado;
- durable challenge registry;
- runbooks.

## Registro por componente

Cada componente deve ter, no mínimo:

- `id`;
- `nome`;
- `finalidade`;
- `estado`;
- `localizacao`;
- `dependeDe`;
- `chamadoPor`;
- `entradas`;
- `saidas`;
- `capabilities`;
- `limites`;
- `healthCheck`;
- `modosDeFalha`;
- `recuperacao`;
- `fallback`;
- `riscoDeReexecucao`;
- `runbook`;
- `seguranca`.

## Fonte legível por máquina

O inventário inicial fica em:

`docs/atlas/ARCA_ATLAS_COMPONENTES_V0_1.json`

Esse arquivo não substitui documentação humana; ele fornece estrutura para futuras ferramentas, Vince, validação e visualização.

## Regra para Vince

Vince poderá futuramente consultar o Atlas para:

- descobrir dependências;
- avaliar impacto de falha;
- localizar runbook;
- identificar fallback;
- decidir se uma ação é permitida;
- saber se deve parar e pedir revisão humana.

Consultar o Atlas não concede autoridade nova ao Vince.


## Frentes futuras congeladas

### Produto, governança e interface

O marco M10 permanece congelado até o ARCA estar funcional de ponta a ponta e haver decisão humana explícita. Inclui políticas de privacidade/segurança, termos de uso, frontend/site, design system próprio, conclusão do Painel do Criador e análise sobre necessidade de login.

### Inteligência cívica documental

O módulo M7-CIV é planejado para consolidar atividade legislativa e histórico público institucional/judicial/administrativo de agentes públicos. O Atlas deverá, quando implementado, mapear adaptadores por fonte, proteção contra homônimos, estados processuais e vínculo de proveniência.

Regra: o ARCA poderá avaliar confiabilidade de fonte/evidência, não reputação ou “confiabilidade” de pessoa.
