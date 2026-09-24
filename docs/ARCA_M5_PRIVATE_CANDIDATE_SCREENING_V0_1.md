# ARCA — M5-L Triagem Privada de Candidatos V0.1

Estado: **IMPLEMENTADO EM BRANCH / EXECUÇÃO LIVE PRIVADA PENDENTE / SEM NOVO GET / SEM CORRELAÇÃO FORTE**.

## Objetivo

Comparar privadamente as normalizações já custodiais do Portal e PNCP depois do Gate M5-K.

O M5-L não executa o correlator M5-B e nunca produz `CONFIRMED`.

## Transporte

O workflow transporta apenas os envelopes criptografados já persistidos no cofre privado:

- Portal: derivação M5-H;
- PNCP: derivação M5-J.

O leitor:

- exige repositório privado;
- allowlista apenas `derived/m5-h/<prefixo>/<sha>.envelope.json`;
- verifica o SHA-256 esperado antes de abrir;
- não imprime ciphertext nem plaintext.

## Comparações permitidas

Para cada par Portal × PNCP:

### Dimensões candidatas

- referência documental exata normalizada;
- texto de órgão/unidade exato normalizado.

A presença de qualquer uma pode produzir somente:

`CANDIDATE`

### Contexto fraco

- mesma data / janela de até 30 dias;
- valor monetário exato.

Data e valor, sozinhos ou juntos, **nunca** criam candidato.

## Proibições

- fornecedor não é comparado;
- fornecedor não é inferido;
- nenhum par vira `CONFIRMED`;
- não há novo GET Portal/PNCP;
- não há publicação de valores;
- não há correlação forte;
- não há achado adverso.

## Prova sanitizada

A saída pode conter:

- pairRef hash-only;
- refs hash-only dos registros;
- classificação `CANDIDATE` ou `NOT_OBSERVED`;
- booleanos das dimensões candidatas;
- booleanos de contexto fraco;
- contagens;
- hashes do screening.

A saída não contém:

- nomes;
- documentos crus;
- datas cruas;
- valores monetários;
- bytes privados.

## Segurança

Flags obrigatórias:

- `strongBridgeObserved=false`;
- `confirmedCount=0`;
- `supplierBridgeObserved=false`;
- `supplierInferenceAllowed=false`;
- `correlationAttempted=false`;
- `sourceNetworkUsed=false`;
- `portalRequestUsed=false`;
- `pncpRequestUsed=false`;
- `publicationAttempted=false`;
- `privateValuesIncluded=false`;
- `humanReviewRequired=true`;
- `adverseFinding=false`.

## Próximo passo

Depois de CI/merge, executar uma única triagem privada sobre as normalizações já existentes e registrar somente a prova sanitizada.

Se houver candidatos, eles permanecem hipóteses documentais para revisão humana. Se não houver, registrar `NO_CANDIDATE_BRIDGE_OBSERVED` sem ampliar aquisição automaticamente.
