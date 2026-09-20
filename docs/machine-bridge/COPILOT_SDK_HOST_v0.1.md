# Copilot SDK Host v0.1

Host mínimo entre o adapter ARCA e o runtime oficial GitHub Copilot SDK. O módulo recebe `createClient` por injeção: não importa pacote, token ou login diretamente e portanto continua testável sem credenciais.

Cada chamada cria sessão limitada, envia somente o envelope ARCA, aplica limite de resposta e encerra sessão/client em `finally`. AbortSignal já faz parte da fronteira para o hardening de cancelamento MBDP.

O host NÃO habilita ferramentas nativas do Copilot e NÃO usa approveAll. Ferramentas continuam sendo solicitadas pelo envelope e executadas somente pela Auditor Tool Interface read-only do ARCA.

O teste atual usa cliente SDK simulado. Integração live exige runtime Copilot oficialmente provisionado no ambiente host; nenhum secret deve entrar no repositório.
