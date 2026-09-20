# ARCA Creator Console V1 — local-first

**Status:** implementação local inicial

## Objetivo

Dar ao Criador um canal direto e provider-independent para observar o ARCA e conversar com `arca-primary` sem depender da interface do ChatGPT ou de outro chat hospedado.

O V1 não cria uma URL secreta nem uma senha mestra persistente. O endereço do console não é considerado segredo.

## Modelo local

O processo `npm run creator` inicia um servidor separado do Workbench comum em `127.0.0.1:4318` por padrão. O servidor recusa bind não-loopback por construção.

Ao iniciar, o host gera um **código de bootstrap efêmero e de uso único**. Esse código:

- existe somente em memória;
- expira em poucos minutos;
- é trocado por uma sessão Creator curta;
- não é persistido em Git, no ARCA_HOME, em jobs, resultados ou audit log;
- cria exclusivamente os scopes `creator.chat` e `creator.read`.

A sessão usa `authMethod=local-bootstrap` e não pode ser expandida para review, mudança, rede, gestão de agentes ou freeze. O browser mantém o token apenas em `sessionStorage`, de forma que não sobreviva como credencial permanente.

## API local

- `GET /api/health` — saúde mínima, sem estado sensível.
- `POST /api/unlock` — troca do bootstrap de uso único por sessão curta; exige header customizado de desbloqueio e mesma origem.
- `GET /api/session` — metadados públicos da sessão atual.
- `GET /api/state` — resumo autorizado de investigações, revisões humanas e audit head.
- `POST /api/chat` — encaminha uma mensagem correlacionada ao hook de `arca-primary` fornecido pelo host.
- `POST /api/logout` — revoga a sessão corrente.

Cada comando autorizado é submetido ao Creator Action Registry antes da execução. O audit log guarda apenas hash do payload e metadados estruturais; texto de chat não é persistido no audit trail.

## Autoridade

Creator Chat V1 é um canal de comunicação, não um shell.

Mesmo autenticado, o canal local não fornece:

- shell arbitrário;
- escrita direta em `main`;
- mutação automática do Core;
- bypass de Human Review;
- autorização de rede;
- gestão de agentes;
- expansão de scopes.

A resposta do chat declara `coreMutationPerformed=false`.

## Relação com `arca-primary`

O Creator Console não inventa uma inteligência própria. O servidor recebe opcionalmente um `chatHandler` do host. Esse handler deve ligar o canal a `arca-primary`, que por sua vez poderá usar um modelo local, um provedor externo autorizado ou uma capability encontrada futuramente no Machine Bridge Mesh.

Se nenhum provedor de raciocínio estiver conectado, `/api/chat` falha explicitamente com `ARCA_PRIMARY_UNAVAILABLE`; leitura de estado continua funcionando.

Isso evita fingir que o coordenador determinístico é, sozinho, um LLM.

## Segurança HTTP

O V1 aplica:

- loopback obrigatório;
- validação de `Host` e `Origin`;
- header customizado no bootstrap;
- CSP `default-src 'self'`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: no-referrer`;
- `Permissions-Policy` restritiva;
- `Cross-Origin-Resource-Policy: same-origin`;
- `Cache-Control: no-store`;
- limite de 64 KiB por request e 16.000 caracteres por mensagem.

## Auditoria

Eventos Creator autorizados ou negados usam `arca-creator-audit-v1`, encadeados por SHA-256 em:

`ARCA_HOME/creator-control/audit.jsonl`

Ao iniciar, o console verifica a cadeia existente e falha se detectar adulteração. O payload não é gravado; apenas `payloadHash`.

## Limite honesto do V1

O bootstrap local reduz risco e evita uma senha mestra estática, mas **não substitui autenticação criptográfica forte**. Qualquer processo malicioso com controle suficiente sobre o mesmo host pode atacar uma aplicação local.

Por isso o V1 deliberadamente não aceita acesso remoto nem operações elevadas.

## Próxima etapa — Passkey / WebAuthn

O V1.1/V2 deve substituir o bootstrap como método normal por:

1. credencial Creator WebAuthn/passkey cadastrada;
2. challenge de servidor com expiração e anti-replay;
3. verificação da assinatura e RP/origin;
4. sessão curta após autenticação;
5. step-up WebAuthn recente para comandos elevados;
6. revogação de credenciais/dispositivos;
7. recovery key offline limitada a recuperação/freeze;
8. acesso remoto somente após TLS e uma fronteira de rede explicitamente confiável.

A URL poderá então ser pública ou conhecida sem funcionar como segredo: a segurança estará na identidade criptográfica, na autorização por scope e na trilha auditável.
