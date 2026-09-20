# GitHub Copilot Agent Adapter v0.1

Boundary provider-neutral para ligar o GitHub Copilot ao MBDP sem conceder autoridade de mutação.

O adapter recebe uma função `send` fornecida pelo host. Essa função será a única peça específica do runtime/SDK Copilot. O adapter exige resposta JSON e aceita somente pedidos `audit_*` ou conclusão estruturada. A autorização real continua na Auditor Tool Interface/Gateway.

## Runtime oficial pretendido

O host deve usar o GitHub Copilot SDK oficial. A documentação atual do GitHub descreve SDK programático para Node/TypeScript e outros runtimes, operando sobre o runtime Copilot CLI via JSON-RPC. A autenticação pode usar usuário GitHub conectado, OAuth, variáveis de ambiente/CI ou server-to-server conforme o ambiente.

Não usar `approveAll` no ARCA. O Copilot deve receber exclusivamente as ferramentas read-only projetadas pelo ARCA e qualquer pedido fora desse conjunto deve falhar fechado.

Nenhum token, sessão ou credencial é persistido por este módulo.
