# ARCA — Checkpoint 037: Produto/Governança congelados e Inteligência Cívica Documental planejada

Data: **2026-09-23**.

Estado: **M5 CONTINUA CAMINHO CRÍTICO; PRODUTO/GOVERNANÇA/INTERFACE CONGELADOS; M7-CIV PLANEJADO; NENHUMA IMPLEMENTAÇÃO OPERACIONAL NOVA ATIVADA**.

## Decisão 1 — M10 Produto, governança, interface e acesso

Criado o marco futuro **M10 — Produto, governança, interface e acesso**.

Estado: **CONGELADO até o ARCA estar funcional de ponta a ponta e haver decisão humana explícita de descongelamento**.

Abrange:

- Política de Privacidade;
- Política de Segurança;
- Termos de Uso;
- frontend/site;
- arquitetura de informação;
- layout/design responsivo e acessível;
- inspiração em princípios de clareza/organização do gov.br, sem imitação institucional;
- design system próprio do ARCA;
- conclusão do Painel do Criador;
- análise sobre necessidade de login;
- definição de papéis e autenticação somente se funcionalmente necessários;
- gate pré-lançamento público.

Regra: não criar sistema de contas, banco de perfis ou autenticação antes de provar necessidade funcional.

## Decisão 2 — M7-CIV Inteligência cívica documental

Criado o módulo futuro **M7-CIV — Inteligência cívica e histórico documental de agentes públicos**.

Escopo planejado:

- projetos de lei;
- autoria/coautoria;
- tramitação;
- emendas;
- pareceres;
- votações nominais públicas;
- mandatos, cargos e funções públicas;
- histórico institucional;
- histórico judicial público;
- histórico criminal apenas por registros/processos/decisões oficiais publicamente acessíveis;
- histórico administrativo e de controle;
- sanções públicas;
- decisões de tribunais de contas e órgãos de controle.

## Regra sobre confiabilidade

O ARCA não deve criar “nota de confiabilidade” de político, servidor ou agente público.

Pode avaliar:

- confiabilidade da fonte;
- integridade documental;
- proveniência;
- consistência entre registros;
- atualidade;
- força do vínculo.

Estados jurídicos/processuais devem permanecer distintos:

- investigação;
- acusação;
- denúncia;
- condenação;
- absolvição;
- arquivamento;
- prescrição;
- recurso;
- trânsito em julgado;
- sanção administrativa;
- sanção expirada/anulada quando aplicável.

Processo ou acusação nunca equivalem automaticamente a culpa.

## Fontes futuras prioritárias

- Dados Abertos da Câmara;
- Dados Abertos do Senado;
- CNJ/DataJud;
- diários oficiais;
- TCU/TCEs/TCMs;
- CGU/CEAF/CEIS/CNEP;
- demais fontes oficiais compatíveis com o contrato do ARCA.

## Atlas

O Atlas Técnico Vivo e o inventário machine-readable foram atualizados com:

- `produto-governanca-interface`;
- `m7-civ-inteligencia-civica`.

## Prioridade

Nenhuma dessas frentes altera o caminho crítico.

O próximo trabalho permanece M5 live:
primeiro 2xx Portal autorizado → custódia → schema real → parser revisado → M5-A → M5-B.
