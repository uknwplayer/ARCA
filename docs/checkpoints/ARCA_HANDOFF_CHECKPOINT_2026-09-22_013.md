# ARCA — Checkpoint 013: M4b Portal controlado implementado em branch

Data: **2026-09-22**

Estado: **IMPLEMENTAÇÃO M4b CONCLUÍDA NO BRANCH; REVISÃO DO CRIADOR PENDENTE; NENHUM GET REAL EXECUTADO**

Branch: `docs/m4b-portal-contract-spec`

Base: `eb8c3e3a3c0a566d284e1ff4d0a915c395a094f5`

Commit local da implementação, antes deste checkpoint: `9e88fce6c781f2dc2d0793392216b043fac55580`. O envio pela conexão GitHub pode consolidar o diff em um novo commit remoto.

PR: **não aberto**. CI canônico desta branch: **ainda não executado**.

## Contrato oficial e escopo

O contrato consultado em 2026-09-22 é o OpenAPI oficial `https://api.portaldatransparencia.gov.br/v3/api-docs` (OpenAPI 3.0.1): `GET /api-de-dados/despesas/documentos-relacionados`, parâmetros requeridos `codigoDocumento` e `fase`; `fase=3` significa pagamento; autenticação pela chave `chave-api-dados` no header. O OpenAPI não promete teto de bytes/registros, conjunto estável de campos obrigatórios nem paginação para esta operação. Esses limites são políticas locais do ARCA.

O v0.2 fixa host, rota e fase, registra somente hash do código no escopo, uma chamada, no máximo 25 registros e 65.536 bytes, timeout de 30 segundos e nenhuma repetição. O escopo não concede autorização de rede. O formato v0.1 e a custódia/recibo PNCP permanecem compatíveis.

## Implementação entregue

- Transporte dedicado com chave apenas no header, rota e query fixas, redirect recusado, timeout, limite de bytes e erros sanitizados.
- Runner ordena pré-validação, pré-voo do cofre privado, GET único, selagem criptográfica dos bytes originais, persistência durável do envelope e prova inicial, reabertura/comparação byte a byte e validação DTO posterior à custódia.
- Falha de validação após captura gera prova final `FAILED`; custódia inválida nunca gera sucesso. A área temporária em texto claro é removida.
- Workflow `workflow_dispatch` apenas, inputs de confirmação e hash de escopo, código/credenciais exclusivamente por secrets, checkout da revisão exata sem persistir credenciais e artefato limitado ao envelope cifrado e prova sanitizada por sete dias. O workflow não foi executado.
- Testes usam somente fake fetch, fixtures e credenciais sintéticas. Nenhum token, código real, resposta Portal, GET, publicação ou artefato em texto claro foi introduzido.

## Verificação local

Node disponível: **24.19.0**; Node 22.18 não está instalado localmente.

- Testes focados do transporte, escopo, probe, workflow e custódia: **34/34 passaram** na última execução combinada.
- `npm test`: **915/916 passaram** no Node 24.19.0; a única falha é `tests/creator-passkey-console.test.mjs` com `UND_ERR_SOCKET`, reproduzindo a discrepância conhecida do ambiente Node 24. A mesma falha já ocorria na linha de base antes destas alterações.
- `PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v`: **27/27 passaram**.
- `PYTHONPATH=. python scripts/validate-investigative-roadmap.py`: **PASS**.
- `npm run validate:multisource`: **PASS**.
- `npm run validate:financial-correlation`: **PASS**.
- `npm run validate:multisource-correlated`: **PASS**.
- `npm run check:public`: **PASS**, sem violações de privacidade/publicação.
- YAML do workflow analisado localmente; trigger único `workflow_dispatch` e `persist-credentials: false` confirmados. `git diff --check`: **PASS** após a última execução focada.

Os gates locais não substituem a CI canônica Node 22.18. Não declarar aceitação integral até a CI da branch passar.

## Próximo gate e limites

Solicitar revisão do Criador do branch e da CI Node 22.18. Após essa revisão, uma consulta Portal continua exigindo autorização separada, ligada ao código final revisado, hash de escopo concreto e cofre privado verificado. Este checkpoint não autoriza dispatch do workflow, GET real, push, abertura de PR ou merge. Não correlacionar dados live no primeiro acesso; publicação permanece desligada. Falhas ou divergência do contrato interrompem a captura.

## Retomada

1. Revisar o diff completo do branch informado contra `main` e o plano M4b.
2. Obter CI canônica Node 22.18 verde antes de declarar M4b verificado.
3. Manter a autorização live como gate separado e explícito.
