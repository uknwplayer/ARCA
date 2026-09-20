# GitHub Read-Only Audit Client v0.1

Cliente backend usado pelo Auditor Gateway. Implementa exclusivamente HTTP GET para recursos GitHub necessários à auditoria.

A credencial, quando necessária para repositório privado, permanece no processo servidor e nunca é incluída na resposta ao agente. A autorização efetiva também deve ser fine-grained/read-only no GitHub.

Recursos iniciais: arquivo, commit, PR, workflow run e job log. O allowlist de repositórios/tipos continua sendo aplicado pelo GitHub Audit Source antes deste cliente.

Este cliente não contém métodos de POST, PUT, PATCH ou DELETE.
