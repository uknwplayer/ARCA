# Relatório de Entrega — ARCA Acquisition & Chain of Custody 0.3.0

**Marco:** 0.3.0  
**Estado:** release funcional local verificado; sem declaração `ARCA-Compatible`

## 1. Resultado

O marco acrescenta uma borda de aquisição local ao sistema 0.2.0 sem conceder rede, credenciais ou autoridade canônica ao Core. Arquivos regulares autorizados podem ser preservados byte a byte, receber SHA-256 real, proveniência declarada, transformações e revisões em cadeia encadeada.

A captura retorna proposta de `DOC` sujeita ao fluxo humano do Agent Bundle. Aquisição continua distinta de evidência e de verdade.

## 2. Entregas

- pacote `@arca/acquisition` e CLI `arca-acquire`;
- contrato `arca-acquisition-request-v1`;
- manifesto `arca-custody-manifest-v1`;
- log `arca-custody-event-v1`;
- captura com raiz autorizada, recusa de symlink, limite de tamanho e detecção de mudança;
- cópia original atômica e permissões privadas;
- transformação com entrada, saída, ferramenta, versão e parâmetros;
- revisão humana append-only;
- verificador de original, derivados, cadeia e projeção;
- fila declarativa sem ação de rede;
- proposta `create_object/DOC` sem escrita direta no Core;
- dois ADRs e especificação normativa;
- 12 testes novos, numerados 31–42.

## 3. Compatibilidade

Os 92 registros do ZIP 0.2.0 foram preservados, salvo arquivos de raiz deliberadamente versionados ou ampliados. O protocolo Core permanece `1.0.0/v1`; os 30 testes legados permanecem no pacote; `npm test` continua descobrindo `tests/*.test.mjs`.

## 4. Verificação

O ZIP candidato foi recuperado pelo hash SHA-256 externo e executado em Node.js
24.19.0. A primeira rodada preservou os 30 testes legados, mas detectou escapes
literais que impediam o carregamento do módulo TypeScript de aquisição. Após a
correção dos entrypoints, a suíte completa encerrou com **42 testes aprovados e
0 falhas**.

O registro da aprovação humana da captura-piloto revelou ainda que um arquivo
`custody.ndjson` válido, mas transportado sem quebra de linha final, concatenava
o evento seguinte. `appendEvent` passou a inserir o separador somente quando
necessário e o cenário foi incorporado ao teste 39. A rodada final manteve
**42/42** e `npm run check` aprovou os arquivos obrigatórios, os nove ADRs, os
seis arquivos de teste e a cadeia da captura real.

A captura distribuída usa uma edição pública higienizada do Documento Mestre
1.3. Estados, exportações e descrições de investigações de desenvolvimento não
integram o pacote. O revisor é identificado apenas pelo papel
`owner-reviewer`, e localizadores privados não são publicados. Tamanho, SHA-256
e head da cadeia são registrados no manifesto e no relatório de testes gerados
para a árvore final. A proposta `DOC` não foi aplicada ao Core.

Uma repetição independente pela CLI `arca-acquire capture + verify`, usando os
mesmos bytes da edição pública em diretório temporário, deve reproduzir o mesmo
SHA-256 e encerrar com `valid: true` e lista de erros vazia.

## 5. Segurança e limites

Não incluídos: crawler, autenticação web, gestão de credenciais, OCR embutido, bypass de acesso, assinatura digital, timestamp confiável externo, ancoragem, Registry, Resolver ou publicação. Hash local detecta alteração; não prova autenticidade externa.

## 6. Reprodução local e CI

```bash
npm ci
npm test
npm run check
npm run test:acquisition
```

Resultado local verificado: 42 testes aprovados, 0 falhas, e `npm run check`
aprovado. O workflow `.github/workflows/arca-ci.yml` reproduz o mesmo portão em
Node.js 22.18.0, primeira versão 22 que habilita type stripping por padrão. A
publicação do workflow depende apenas de um repositório GitHub
autorizado ao conector.
