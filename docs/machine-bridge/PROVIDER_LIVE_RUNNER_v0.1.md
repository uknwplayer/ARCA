# Provider Live Runner v0.1

Última camada antes de um teste com provedor externo: descobre apenas provedores que possuem chave **e** modelo no ambiente, projeta publicamente somente id/model e cria o auditor com ferramentas read-only já vinculadas ao agentId.

Ausência de credencial falha com `ARCA_PROVIDER_NOT_PROVISIONED`. O runner não tenta descobrir, imprimir ou persistir secrets.

Para ativação real, o operador provisiona a chave diretamente no secret store do ambiente de execução. Nunca enviar a chave em chat, commit, issue, log ou Deliberation Room.

Os testes usam fetch simulado. A presença deste runner não significa que qualquer provedor esteja atualmente provisionado.
