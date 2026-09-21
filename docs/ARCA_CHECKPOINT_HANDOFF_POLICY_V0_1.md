# Política de checkpoint e handoff ARCA v0.1

Estado: **ATIVA**

## Objetivo

Permitir que outro ambiente ou um chat com contexto limitado retome o trabalho sem reconstruir decisões, provas e limites de segurança.

## Regra de encerramento

Toda sessão que integrar mudança material deve:

1. atualizar `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`;
2. criar um checkpoint versionado e imutável no mesmo diretório;
3. registrar SHA canônico, PRs, CI, testes, decisões, limites, pendências e sequência exata de retomada;
4. atualizar o checkpoint operacional privado quando houver topologia, nomes internos ou instruções que não pertencem ao repositório público.

A entrega só é considerada encerrada depois de o checkpoint final estar integrado.

## Camadas

- **Pública:** estado sanitizado, provas públicas, arquitetura, alegações permitidas/proibidas e roteiro de continuidade.
- **Operacional privada:** nomes exatos de repositórios operacionais, SHAs, workflows, dependências e passos de execução. Mesmo nesta camada, nunca registrar valores secretos, plaintext, material bruto investigativo ou chaves.

## Convenção

- atual: `ARCA_HANDOFF_CHECKPOINT_CURRENT.md`;
- histórico: `ARCA_HANDOFF_CHECKPOINT_YYYY-MM-DD_NNN.md`;
- um checkpoint histórico não é sobrescrito;
- se o estado final só for conhecido após merge/CI, abrir uma PR curta de fechamento com os valores finais.

## Conteúdo mínimo

- estado e maturidade;
- repositório/branch/SHA;
- PRs e execuções relevantes;
- resultado dos testes;
- decisões permanentes;
- mudanças da sessão;
- riscos, limites e “não alegar”;
- trabalho pendente ordenado;
- comandos/passos de verificação;
- condição de parada e autoridade necessária.

## Higiene

Nenhum checkpoint deve conter tokens, valores de secrets, URLs assinadas, ciphertext de custódia, plaintext de fonte, dados pessoais não necessários ou localização privada de artefatos. Referenciar IDs, hashes e recibos sanitizados é permitido.
