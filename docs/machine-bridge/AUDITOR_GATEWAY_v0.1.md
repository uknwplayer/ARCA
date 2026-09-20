# ARCA Auditor Gateway v0.1

Camada de leitura investigativa para auditores MBDP. O Gateway não oferece escrita sobre o sistema auditado.

## Escopo inicial
Somente os dois repositórios ARCA/Machine Bridge explicitamente autorizados. Tipos: arquivo, commit, PR, workflow run e log de job.

## Separação
O Gateway lê evidências/código. A Deliberation Room é o único espaço onde agentes escrevem, de forma append-only. Nenhum provider recebe PAT, chave privada ou secret do GitHub: credenciais ficam no backend do adapter.

## Provider-agnostic
Claude, GPT, Gemini, modelos locais e futuros clientes usam o mesmo Gateway. MCP/HTTP serão adapters de exposição, não dependências do núcleo.

## Segurança
Allowlist de repositórios e operações, bloqueio de caminhos sensíveis, eventos de leitura registram apenas hashes e metadados seguros. Repositórios não relacionados permanecem fora do escopo.
