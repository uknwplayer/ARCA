# ARCA AIE — D2 Preregistration Specification v0.4.0

## Status

**D2-prep implementado. D2 público ainda não executado.**

Este estágio fortalece o protocolo D1 para que um futuro benchmark público possa demonstrar que tanto o corpus quanto o answer key foram definidos antes de observar os resultados do AIE.

## 1. Problema

Separar o answer key da execução evita vazamento direto, mas não prova que o gabarito permaneceu inalterado após o run. Também é necessário demonstrar que o run analisou exatamente o corpus anunciado antes da execução.

## 2. Manifesto de corpus

Formato: `arca-aie-blind-corpus-manifest-v1`.

`buildBlindCorpusManifest(corpus)` produz:

- `corpusId`;
- `corpusFingerprint` determinístico;
- contagem total de samples;
- `sampleId`, `recordCount` e `itemCount` por sample;
- invariantes indicando que não há answer key embutido.

O fingerprint depende do conteúdo validado do corpus. Alteração de qualquer sample, registro, item ou metadata altera o fingerprint.

`buildBlindProcurementRun` inclui esse mesmo `corpusFingerprint`. Assim, um manifesto publicado/congelado antes do run pode ser comparado ao run posterior.

## 3. Commitment do answer key

Formato: `arca-aie-blind-answer-key-commitment-v1`.

Antes do run, o responsável pelo benchmark possui:

- answer key completo;
- nonce secreto imprevisível.

Executa:

```text
commitment = SHA-256(
  dominio/versionamento
  + nonce secreto
  + answer key normalizado
)
```

O artefato público contém apenas:

- `corpusId`;
- `algorithm: sha256`;
- digest do commitment;
- quantidade de expectativas;
- indicação de que nonce é necessário para abrir;
- `answerKeyIncluded: false`.

O nonce **não** é publicado antes do scoring.

## 4. Por que o nonce é secreto

Um gabarito pequeno pode possuir baixa entropia. Um hash simples permitiria testar combinações prováveis até encontrar uma que produzisse o mesmo digest.

O nonce secreto impede esse uso do commitment como oráculo de confirmação antes da abertura. Ele deve permanecer fora do runner e só ser revelado após a execução.

## 5. Abertura

`verifyBlindAnswerKeyCommitment(commitment, answerKey, nonce)` recalcula o digest e informa se o material revelado corresponde ao pré-registro.

Qualquer alteração no answer key ou nonce resulta em `valid: false`.

## 6. Scoring comprometido

`scoreCommittedBlindProcurementRun(run, commitment, answerKey, nonce)` exige:

1. run válido;
2. commitment do mesmo `corpusId`;
3. abertura criptograficamente válida;
4. answer key cobrindo exatamente os samples do run.

Somente então o scorer calcula as métricas D1 e adiciona:

- `commitmentVerified: true`;
- digest pré-registrado;
- indicação de que o nonce foi revelado somente no scoring.

## 7. Sequência recomendada para D2 público

```text
T0  definir fontes, órgão/período e versão do código
T1  construir/preservar corpus
T2  gerar manifesto e corpusFingerprint
T3  preparar answer key por revisão humana independente
T4  gerar nonce secreto
T5  publicar/registrar manifesto + commitment
T6  executar AIE sem answer key/nonce
T7  repetir run se reprodutibilidade fizer parte do protocolo
T8  revelar answer key + nonce
T9  verificar commitment
T10 calcular score
T11 revisar falsos positivos/negativos e limitações
T12 publicar relatório metodológico
```

A ordem T0–T12 deve ser registrada externamente de maneira auditável quando D2 for executado de verdade.

## 8. Gate automatizado

A preparação D2 adiciona seis testes:

1. fingerprint do corpus é determinístico e muda quando dados mudam;
2. run fica vinculado ao fingerprint do manifesto;
3. commitment não contém answer key nem nonce;
4. commitment só abre com answer key + nonce corretos;
5. scoring comprometido recusa abertura inválida;
6. commitment de outro corpus é recusado.

Somados aos oito testes D1, existem 14 testes específicos de avaliação cega/pré-registro. A suíte total passa a **123 testes**.

## 9. Limitações

- nenhum benchmark público D2 foi executado nesta etapa;
- não há timestamp externo, notário ou testemunha criptográfica;
- não há assinatura digital do commitment;
- geração/armazenamento seguro do nonce fica fora do ARCA nesta versão;
- SHA-256 prova consistência do material revelado com o commitment, não autoria;
- qualidade do gabarito depende de revisão humana competente e idealmente independente.

## 10. Critério para declarar D2 executado

D2 só poderá ser declarado executado quando existir um corpus público real, delimitado e preservado, cujo manifesto/commitment tenham sido definidos antes do run e cujo answer key tenha sido aberto somente depois das execuções.

Até lá, o estado oficial é **D2-prep**, não D2 concluído.
