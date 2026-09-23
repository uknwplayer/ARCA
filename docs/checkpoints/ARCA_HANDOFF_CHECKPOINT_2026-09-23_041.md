# ARCA — Checkpoint 041: Gate 040 com prova operacional concluída; quarto GET ainda bloqueado

Data: **2026-09-23**.

Estado: **GATE 040 PROVADO OPERACIONALMENTE COM SECRETS REAIS; ZERO GET PORTAL; HASHES SANITIZADOS REVISADOS; CREDENCIAL AINDA ACTIVE_UNKNOWN; QUARTO GET NÃO AUTORIZADO**.

## Prova operacional do Gate 040

Workflow:

`.github/workflows/arca-portal-isolated-preflight.yml`

Run canônico:

- run: `35884318441`;
- conclusão: **success**;
- revisão validada: `133e7943e1eac9d90be79652d7544787ba1613fa`;
- execução iniciada após atualização do secret correto;
- token não foi exposto nem persistido no repositório.

Saída sanitizada relevante:

- `status=READY_FOR_EXPLICIT_AUTHORIZATION`;
- `scopeHash=06702c06faac9eea05c6ce5e7a0577dec807d33edeb23750c8d6a66b98710685`;
- `preflightSha256=8fbf3113c6d30895b05d31d9c3a6483ae320cd627b0d17984fc1e6d202dc0356`;
- `credentialFingerprintSha256=37c90b46b7e1a4fcf699aee3f94979829cb044d13979cfbf05a229cd869a8092`;
- `credentialProvenance=OFFICIAL_EMAIL_REGISTRATION`;
- `credentialReceivedAt=2026-09-23T01:41:18.000Z`;
- `credentialActiveState=ACTIVE_UNKNOWN`;
- `credentialActiveVerified=false`;
- `custodyReady=true`;
- `custodyPrivate=true`;
- `custodyBranch=main`;
- `portalNetworkUsed=false`;
- `portalNetworkAuthorized=false`;
- `portalRequestCapabilityPresent=false`;
- `automaticRetryAuthorized=false`;
- `humanAuthorizationRequired=true`;
- `tokenIncluded=false`;
- `rawDocumentCodeIncluded=false`.

## O que esta prova estabelece

O Gate 040 consegue, no ambiente real do GitHub Actions e com os secrets reais:

1. validar presença/formato/proveniência da credencial;
2. derivar o scope controlado;
3. validar o cofre privado;
4. produzir fingerprint e digest sanitizados;
5. vincular a futura autorização à revisão/documento/credencial/custódia;
6. permanecer sem capability de request ao Portal.

Isso remove a pendência de **prova operacional do preflight**.

## O que esta prova NÃO estabelece

Ela não comprova atividade da credencial no Portal.

`ACTIVE_UNKNOWN` continua correto porque nenhuma requisição ao endpoint do Portal foi feita.

Também não houve:

- quarto GET;
- primeiro 2xx Portal;
- captura de resposta Portal;
- nova correlação live;
- retry automático;
- publicação;
- exposição do token ou do código bruto do documento.

## Binding preservado

Uma eventual autorização posterior para exatamente um GET deve usar, sem alteração:

- `scope_sha256=06702c06faac9eea05c6ce5e7a0577dec807d33edeb23750c8d6a66b98710685`;
- `preflight_sha256=8fbf3113c6d30895b05d31d9c3a6483ae320cd627b0d17984fc1e6d202dc0356`;
- `credential_fingerprint_sha256=37c90b46b7e1a4fcf699aee3f94979829cb044d13979cfbf05a229cd869a8092`;
- proveniência `OFFICIAL_EMAIL_REGISTRATION`;
- instante `2026-09-23T01:41:18.000Z`;
- revisão `133e7943e1eac9d90be79652d7544787ba1613fa`.

Se revisão, documento, token, repositório/branch de custódia ou qualquer material coberto pela atestação mudar, os hashes deixam de valer. Nesse caso é obrigatório executar novo Gate 040, revisar a nova saída e obter nova autorização humana.

## Próximo gate

O próximo passo **não é automático**.

Permanece bloqueado até autorização humana explícita para **exatamente um GET** no workflow live. Essa autorização deve ser específica para os vínculos acima.

Se houver resposta 2xx:

```text
GET único autorizado
        ↓
custódia privada
        ↓
M5-C observa schema sem valores
        ↓
revisão humana do schema
        ↓
parser em gate separado
        ↓
normalização
        ↓
M5-A/B
```

Se houver 401/403/429/5xx, preservar a prova e parar. `retries=0`.

## Segurança e frentes congeladas

Continuam válidos:

- publicação desligada;
- revisão humana obrigatória;
- nenhum quarto GET por inferência;
- Vince Controlled Self-Improvement congelado;
- Edge Steward congelado;
- M10 congelado;
- M7-CIV congelado;
- Runtime Autônomo Local congelado;
- ARCA AI Gateway congelado.

Checkpoint anterior: [040](ARCA_HANDOFF_CHECKPOINT_2026-09-23_040.md).
