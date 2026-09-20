# Relatório de Entrega — ARCA Workbench + Agent Bundle 0.2.0

**Data da entrega:** 2026-09-14  
**Marco:** 0.2.0  
**Estado:** funcional em ambiente local; pré-produção; sem declaração `ARCA-Compatible`

## 1. Resultado

O marco transforma a fundação 0.1.0 em um sistema operável por interface visual. O ARCA agora cria e revisa investigações sem edição manual de JSON, mostra o grafo, executa TRACE, expõe os 47 requisitos ACS, preserva o histórico e recebe propostas de agentes sob controle humano.

A autoridade permanece concentrada no Core. Nem navegador, servidor HTTP nem agente escrevem diretamente no event log.

## 2. Escopo entregue

### 2.1 Workbench local

- executável `arca-workbench` e script `npm run workbench`;
- servidor HTTP nativo, sem dependências externas de runtime;
- bind `127.0.0.1:4317` por padrão;
- interface responsiva em português;
- seletor e criação de investigações;
- formulários para 12 tipos de objeto;
- formulário de relações com orientação `INF → PRO`;
- mapa SVG gerado exclusivamente do estado canônico;
- inventário com busca e filtro;
- TRACE de antecedentes e dependentes com caminhos completos;
- matriz ACS de 47 requisitos, perfis e bloqueadores;
- histórico de eventos e exportação `.arca.json`;
- invalidação, reavaliação, fechamento e reabertura por operações separadas.

### 2.2 Agent Bundle

- prompt de sistema independente de fornecedor;
- schema `arca-agent-proposal-v1` fechado;
- exatamente uma operação por proposta;
- armazenamento separado do estado canônico;
- `proposalHash` do conteúdo imutável;
- `recordHash` cobrindo status e revisão;
- escrita atômica, arquivos privados e lock por proposta;
- `expectedEventHead` e detecção de obsolescência;
- confirmação textual `APLICAR <proposalId>`;
- decisão de rejeição persistida;
- recuperação idempotente quando o evento existe e o registro ainda está pendente;
- evento atribuído ao revisor humano e ligado ao ID/hash da proposta.

### 2.3 Concorrência do Core

As operações mutáveis aceitam `expectedEventHead`. O armazenamento compara o valor dentro do lock do event log. Um head antigo produz conflito antes do append, eliminando a janela entre validação no cliente e gravação.

## 3. Controles de segurança

| Controle | Estado |
|---|---|
| loopback por padrão | implementado |
| bind remoto somente explícito | implementado |
| validação de Host local | implementado |
| política de Origin | implementado |
| CSRF aleatório por processo | implementado |
| corpo máximo de 1 MiB | implementado |
| JSON obrigatório em escrita | implementado |
| whitelist de estáticos | implementado |
| CSP e anti-frame | implementado |
| concorrência otimista no lock | implementado |
| detecção de adulteração de proposta | implementado |
| autenticação e autorização | fora do escopo 0.2.0 |
| criptografia em repouso | fora do escopo 0.2.0 |
| assinatura/ancoragem externa | fora do escopo 0.2.0 |

## 4. Verificação executada

Comando:

```bash
npm test
```

Resultado observado: **30 testes aprovados, 0 falhas**.

Cobertura comportamental:

- 15 testes preservados da fundação Core/CLI;
- 7 testes do ciclo de propostas e concorrência;
- 6 testes do Workbench/API e segurança local;
- 2 testes de propriedades e IDs, incluindo 40 DAGs pseudoaleatórios.

Os testes verificam reconstrução, hash chain, TRACE ramificado, ciclos legados, invalidação, O Limite, 47 requisitos, migrações, exportação, confirmação humana, obsolescência, adulteração, CSRF, Origin, tamanho de corpo, bind remoto e aplicação ponta a ponta.

## 5. Verificação visual

A interface foi construída com sistema visual responsivo, componentes semânticos, foco visível e redução de movimento. A conexão do navegador de inspeção remoto com o loopback do executor foi bloqueada pela política do ambiente; nenhuma exposição persistente foi mantida. A validação HTTP e estática foi concluída, mas a auditoria visual automatizada multiviewport deve ser repetida em um ambiente que permita acesso ao servidor local antes de uma release de produção.

Esta limitação de QA não afeta os 30 testes automatizados nem autoriza afirmar conformidade WCAG.

## 6. Compatibilidade

- protocolo e schemas canônicos permanecem `1.0.0` / `v1`;
- event logs 0.1.0 continuam reconstruíveis;
- APIs do Core existentes permanecem compatíveis;
- `expectedEventHead` é parâmetro opcional no Core e obrigatório nas escritas do Workbench;
- a capacidade de migração legada permanece preservada e coberta por fixtures
  sintéticas efêmeras; os casos usados no desenvolvimento não integram a
  distribuição pública.

## 7. Arquivos normativos novos

- `docs/ARCA_WORKBENCH_SPEC_v0.2.0.md`;
- `docs/ARCA_AGENT_PROTOCOL_v0.2.0.md`;
- `docs/adr/ADR-ARCA-0006-workbench-core-boundary.md`;
- `docs/adr/ADR-ARCA-0007-agent-proposal-human-review.md`;
- `packages/agent/ARCA_AGENT_SYSTEM_PROMPT_v0.2.0.md`;
- `packages/agent/arca-agent-proposal-v1.schema.json`.

## 8. Restrições declaradas

O marco não inclui autenticação, multiusuário, sincronização, aquisição, OCR, conectores, publicação, assinatura, Registry, Resolver, Attestation ou Federation. `--allow-remote` não transforma o servidor em implantação segura.

O sistema não concede selo, não verifica verdade automaticamente e não converte saída de IA em evidência.

## 9. Próximo marco recomendado

`0.3.0 — Acquisition Adapter + cadeia de custódia`:

1. contrato de aquisição separado do Core;
2. preservação dos bytes originais;
3. hash real calculado localmente;
4. localizador e timestamp declarados;
5. registro de transformação e revisão;
6. filas de busca e aquisição sem contornar acessos;
7. testes com arquivos reais autorizados e fixtures hostis;
8. atualização do Documento Mestre no mesmo ciclo de release.
