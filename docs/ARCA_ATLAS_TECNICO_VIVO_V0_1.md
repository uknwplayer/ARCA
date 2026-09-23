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


### M5-C — observação estrutural do schema Portal

Componente: `m5-c-observador-schema-portal`.

Função: receber bytes Portal já custodiais e verificados, extrair somente estrutura/tipos sem valores e vincular a observação aos hashes de custódia. Não normaliza, não publica e não admite parser automaticamente.

Recuperação: se houver drift ou estrutura incompatível, preservar a observação, manter a normalização bloqueada e exigir revisão humana. Não repetir GET apenas para “tentar outro schema”.


### M5-D — prontidão da credencial Portal

Componente: `m5-d-prontidao-credencial-portal`.

Função: separar token presente/formato/proveniência de atividade real. Produz fingerprint sanitizado e mantém `ACTIVE_UNKNOWN` até observação da própria API.

Recuperação: em 401, preservar status e fingerprint, revisar emissão/configuração/documentação e exigir nova autorização antes de qualquer nova tentativa. Nunca concluir causa específica apenas pelo código HTTP.


### Gate 040 — preflight Portal isolado

Componente: `portal-isolated-preflight`.

Função: validar fingerprint/proveniência da credencial, scope e cofre privado sem possuir capability de request ao endpoint do Portal.

Recuperação: qualquer falha mantém rede Portal não autorizada. Corrigir metadado, secret ou cofre e repetir somente o preflight. O quarto GET continua em gate humano separado.


### ARCA Device Agent / Runtime Autônomo Local

Estado: **planejado/congelado**.

Função futura: expor capabilities locais explícitas do dispositivo ao plano de controle do ARCA, com três níveis separados de autoridade: ARCA-only, Termux e Device.

A variante Runtime Autônomo Local poderá executar modelo, memória, scheduler e ferramentas em infraestrutura controlada pelo operador. Isso cria independência operacional da nuvem, mas não constitui transferência da instância/modelo hospedado pelo ChatGPT para o dispositivo.

Princípios: deny-by-default, capability catalog, identidade criptográfica, replay protection, revogação, kill switch, watchdog, budgets de recurso e auditoria.

Decisão: **Device Agent é o caminho preferencial para o operador atual**. Runtime Autônomo Local permanece congelado até solicitação explícita do usuário.

Documento canônico: `docs/ARCA_DEVICE_AGENT_RUNTIME_LOCAL_V0_1.md`.


### ARCA AI Gateway / OpenAI-compatible

Estado: **planejado/congelado até solicitação explícita do usuário**.

Função futura: oferecer uma interface única para modelos remotos ou locais, começando potencialmente pela OpenAI API sem servidor próprio. Deve manter capability discovery, trust separado, budget/custo e fallback por provider.

Documento canônico: `docs/ARCA_AI_GATEWAY_OPENAI_COMPATIBLE_V0_1.md`.
