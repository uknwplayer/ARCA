# Machine Bridge — Ciclo de Vida da Identidade do Operador

## Problema

Uma identidade federada não existe apenas porque sua chave pública foi publicada. O operador precisa demonstrar posse contínua e controlada da chave privada correspondente durante assinatura, rotação e revogação.

Execuções isoladas não podem presumir que um segredo criado numa execução continuará disponível na próxima.

## Invariantes

- chaves privadas nunca entram em Git, logs, artefatos públicos ou payloads de investigação;
- a chave pública pode ser publicada e pinada;
- uma identidade só recebe estado `operational` depois de uma prova de posse válida;
- perda da chave privada torna a identidade `unavailable`, não autoriza regeneração silenciosa;
- troca de chave exige rotação explícita;
- pinning antigo não é substituído silenciosamente;
- falha de identidade é fail-closed e não autoriza failover automático;
- o protocolo não depende de shell remoto arbitrário.

## Estados

`generated -> proof-pending -> operational -> rotating -> retired`

Uma identidade também pode entrar em `unavailable` quando a posse da chave privada não puder ser demonstrada.

## Prova de posse

Antes de usar uma identidade em federação real, o operador assina um desafio contendo domínio, operatorId, fingerprint, nonce e validade curta. O verificador confere a assinatura com a chave pública pinada. Somente então a identidade pode ser considerada operacional.

## Armazenamento

O protocolo aceita implementações externas de armazenamento seguro — por exemplo secret store do ambiente de execução ou hardware-backed keystore — mas não exige que o ARCA conheça ou serialize a chave privada.

O Core trabalha com uma interface de signer: recebe bytes canônicos e devolve assinatura. Assim, a chave privada pode permanecer fora do processo que coordena a Machine Bridge.

## Incidente observado

Durante a preparação da primeira prova A ↔ B, uma chave pública foi preparada sem que fosse possível demonstrar persistência segura da privada correspondente entre execuções. Essa identidade não deve ser promovida a operacional. O incidente é preservado como requisito arquitetural, não como prova de federação.
