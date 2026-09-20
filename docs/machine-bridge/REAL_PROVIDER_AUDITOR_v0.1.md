# Real Provider Auditor Composition v0.1

Composição do caminho completo de um auditor externo real:

Provider Reasoner → Provider HTTP Adapter → Provider Codec → Tool-enabled Auditor → ferramentas read-only → Auditor Gateway → retorno ao modelo → mensagem MBDP.

O módulo não contém chaves nem seleciona credenciais. `apiKey` e `fetchImpl` são injetados pelo host. A autorização final de ferramentas continua local: uma resposta do modelo não concede capacidade por si só.

Os testes percorrem o circuito completo com HTTP simulado. Portanto validam composição e controles, mas ainda não constituem uma chamada real a qualquer provedor.
