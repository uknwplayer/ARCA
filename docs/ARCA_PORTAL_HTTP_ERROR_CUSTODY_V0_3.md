# ARCA — Portal HTTP Error Custody V0.3

Status: **CANÔNICO / SEM NOVA AUTORIZAÇÃO DE REDE**.

## Motivo

As três primeiras tentativas live do endpoint Portal `despesas/documentos-relacionados` chegaram ao serviço oficial com preflight válido, mas receberam HTTP 401. O probe V0.2 descartava respostas não-2xx antes de ler e custodiar os bytes, preservando apenas o código de erro no log. Isso impedia auditoria posterior do corpo de erro.

## V0.3

O transporte continua fail-closed por padrão. Apenas o probe controlado pode habilitar explicitamente `captureHttpErrors:true`.

Quando habilitado:

- mantém exatamente uma requisição e zero retries;
- mantém teto de 65536 bytes e timeout de 30000 ms;
- continua recusando redirects;
- respostas 4xx/5xx são lidas dentro do mesmo orçamento;
- bytes originais são selados antes de interpretação;
- envelope é cifrado e enviado somente ao cofre privado;
- prova sanitizada expõe apenas status HTTP, classe, código ARCA fixo, hashes e contagem de bytes;
- corpo bruto, código de documento e API key não entram na prova pública;
- resposta não-2xx continua com `probeStatus: FAILED`;
- para não-2xx, `validationStatus: NOT_APPLICABLE`;
- nenhum erro HTTP vira achado investigativo ou sinal adverso.

Os workflows tentam preservar envelope/prova mesmo quando o passo live termina em falha operacional. Ausência de artefatos em falha anterior ao capture continua permitida.

## Compatibilidade

O backend privado aceita provas Portal V0.2 e V0.3. O comportamento padrão do transporte fora do probe não mudou: sem `captureHttpErrors:true`, um 401/4xx/5xx continua gerando erro imediato.

## Autenticação oficial observada

A documentação oficial atual informa que o cadastro da API requer autenticação Gov.br por conta Prata/Ouro ou CPF/senha com verificação em duas etapas, e que o token é entregue ao e-mail cadastrado no Gov.br.

Referências públicas:
- https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email
- https://portaldatransparencia.gov.br/api-de-dados/
- https://api.portaldatransparencia.gov.br/v3/api-docs

## Limite atual

Nenhum quarto GET está autorizado. Antes de nova tentativa deve-se confirmar a validade/ativação do token pelo fluxo oficial e, se necessário, usar o contato técnico oficial da CGU.
