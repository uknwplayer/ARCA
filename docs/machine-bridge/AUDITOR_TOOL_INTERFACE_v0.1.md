# Auditor Tool Interface v0.1

Interface pública e neutra de transporte do Auditor Gateway.

Ferramentas iniciais:
- audit_get_file
- audit_get_commit
- audit_get_pull
- audit_get_workflow_run
- audit_get_workflow_job_log

Todas são read-only. A identidade do auditor é vinculada pelo host, não fornecida livremente em cada chamada.

`auditor-mcp-projection.mjs` projeta o contrato para um host MCP, mas MCP não faz parte do núcleo. O mesmo conjunto pode ser exposto por HTTP/RPC sem mudar as regras de autorização.

Não existem ferramentas de push, merge, dispatch, criação/edição de arquivos, secrets, trust, ownership ou routing.
