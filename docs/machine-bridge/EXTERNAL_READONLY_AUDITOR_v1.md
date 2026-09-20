# Machine Bridge — External Read-Only Auditor v1

## Objetivo

Permitir que Claude ou qualquer outro agente externo audite uma execução da Machine Bridge sem receber autoridade operacional sobre a ponte.

## Papel

O auditor é **observacional**. Ele não é Executor, Controller, Trust Authority, Transport ou mecanismo de consenso.

### Pode
- ler o pacote público de prova;
- verificar commits, hashes, identidades públicas, assinaturas e correlações;
- comparar eventos e timestamps;
- apontar contradições, lacunas e alegações não demonstradas;
- emitir um parecer estruturado.

### Não pode
- receber chaves privadas, PATs, Actions secrets ou credenciais;
- fazer push, merge ou alterar branches;
- disparar execução remota;
- alterar trust, ownership, routing ou failover;
- aprovar uma execução em nome do protocolo;
- transformar ausência de evidência em prova de não execução.

## Contrato de parecer

```json
{
  "format": "arca-external-audit-report-v1",
  "version": 1,
  "auditId": "string",
  "auditor": {
    "provider": "string",
    "model": "string"
  },
  "evidenceSetHash": "sha256",
  "observations": [],
  "verifiedClaims": [],
  "unverifiedClaims": [],
  "contradictions": [],
  "verdict": "consistent | inconsistent | insufficient-evidence",
  "auditedAt": "ISO-8601"
}
```

O `verdict` descreve apenas consistência do conjunto observado; não autoriza execução nem modifica estado.

## Pacote público de prova

O auditor deve receber somente dados públicos/minimizados:
- requestId/jobId;
- hashes de payload, ownership, statements e resultado;
- identidades públicas/fingerprints;
- accepted/completed assinados;
- commits e runs públicos relevantes;
- prova de reconciliação, quando existir.

Payload privado, secrets e credenciais ficam excluídos.

## Claude

Claude pode ocupar este papel, mas o protocolo não depende de Claude. O mesmo contrato deve funcionar com GPT, outro modelo, verificador determinístico ou auditor humano.

A divergência entre auditores deve ser preservada, não apagada. A fonte de verdade continua sendo a evidência verificável.
