# ARCA — Vince V4 Heterogeneous Execution Gate V0.1

Status: **DESIGN GATE / AGUARDA CONTRATO REAL DO AMBIENTE REPLIT**.

## Objetivo

V4 deve provar que a mesma missão Vince pode atravessar duas fronteiras operacionais diferentes:

```text
ARCA / GitHub control plane
        |
        v
dedicated V4 queue
        |
        v
Replit worker (independent runtime)
        |
        v
allowlisted synthetic execution
        |
        v
structured result + provenance + hashes
        |
        v
ARCA verification / reconciliation
```

A prova não será considerada V4 se ambos os lados forem apenas dois executores homogêneos do mesmo mecanismo GitHub Actions.

## Primeira missão permitida

Somente:

`git-status`

Objetivo: demonstrar transporte, execução limitada e retorno. Nenhuma aquisição PNCP/Portal, shell arbitrário, mutação de código ou efeito externo é permitido.

## Requisitos da request

O contrato final deve incluir, no mínimo:

- schema/version dedicado V4;
- job/mission ID seguro;
- `action = git-status`;
- expiration obrigatória;
- mission SHA-256;
- checkpoint SHA-256 ou binding equivalente;
- expected canonical ARCA revision;
- public-only;
- secrets forbidden;
- core mutation forbidden;
- retry/failover forbidden na primeira prova;
- correlation ID;
- request SHA-256 canônico.

Nenhum comando shell deve atravessar o canal.

## Requisitos do worker Replit

O worker deve:

- observar apenas um diretório V4 dedicado;
- nunca ler requests v1/v2 nesse modo;
- aceitar apenas `git-status`;
- executar sem shell;
- ter stdout/stderr limitados;
- registrar checkout HEAD, branch e dirty state;
- produzir canonical result SHA-256;
- manter ledger local específico V4 contra replay no mesmo ambiente;
- executar apenas quando iniciado explicitamente;
- não iniciar junto do Workbench;
- não expor novo endpoint HTTP público;
- não registrar tokens/secrets.

## Requisitos do resultado

O ARCA deve exigir:

- result schema/version esperado;
- jobId/correlation exatos;
- action exata;
- status terminal;
- exit code;
- request SHA-256;
- result SHA-256;
- execution provenance:
  - environment kind = Replit;
  - git HEAD;
  - git branch;
  - git dirty;
- bounded stdout/stderr;
- timestamps válidos.

O resultado deve falhar fechado em caso de drift.

## Interpretação da prova

Se o teste passar, declarar somente:

**V4 transporte/execução/retorno heterogêneo live-proven entre GitHub control plane e Replit worker.**

Não declarar ainda:

- attestation criptográfica independente do Replit;
- identidade persistente do worker;
- exactly-once global;
- claim/lease distribuído;
- V4 production-ready;
- trust automático;
- authority expansion.

## Relação com V3.2

V3.2 já fornece:

- Execution Identity;
- mission/checkpoint/proof rehash;
- Mesh signed recovery receipt;
- trust pinning.

A primeira prova V4 pode usar o canal Replit sem assinatura própria do worker, mas deve registrar essa limitação explicitamente. O passo posterior é ligar o resultado V4 a uma identidade/signature persistente do ambiente remoto.

## Stop conditions

Parar sem execução se:

- contrato Replit real divergir deste gate;
- o worker estiver configurado para processar requests históricos;
- houver ação diferente de `git-status`;
- secrets forem necessários no payload;
- expected revision não puder ser vinculada;
- o modo V4 iniciar automaticamente;
- houver mais de um consumidor ativo conhecido;
- o resultado não puder ser correlacionado univocamente;
- a resposta exceder limites;
- existir qualquer tentativa de fallback silencioso.

## Próximo passo

Após o Replit concluir a implementação isolada:

1. inspecionar o contrato real;
2. reconciliar este gate com o contrato;
3. criar parser/verificador ARCA;
4. criar issue one-shot V4;
5. preparar exatamente uma request;
6. iniciar exatamente um ciclo V4 no Replit;
7. verificar retorno;
8. registrar prova e limites.
