# Machine Bridge — Prova de Federação Real A ↔ B

## Estado

O Operador A usa um repositório autorizado configurado pelo ambiente de execução.

O Operador B usa outro repositório autorizado e independente, também fornecido por configuração. A especificação pública não fixa nomes de repositórios operacionais.

## Probe inicial

A primeira travessia deve usar exclusivamente `worker.ping`. O A gera uma identidade Ed25519 fora do repositório e assina a requisição. Somente a identidade pública pode ser pinada no B.

A chave privada não pode ser commitada, publicada como artefato ou gravada em logs.

## Critério de sucesso

A prova só pode ser declarada concluída quando:

1. A gerar e assinar o probe;
2. o probe atravessar para o inbox real do repositório B;
3. B verificar a identidade pinada, assinatura, validade e replay;
4. B executar somente `worker.ping`;
5. B publicar resultado correlacionado no outbox;
6. A recuperar e verificar o resultado;
7. IDs, hashes, commits e execuções necessárias forem preservados como evidência, sem segredo.

Teste local, mock ou dois diretórios no mesmo processo não satisfazem esse critério.
