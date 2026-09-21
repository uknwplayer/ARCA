# ARCA — M1: despesas do Portal da Transparência em fixture offline

Estado: **INTEGRADO À `main`; CI PÓS-MERGE VERDE** — [PR #76](https://github.com/uknwplayer/ARCA/pull/76), [CI pós-merge](https://github.com/uknwplayer/ARCA/actions/runs/35650058116).

Fonte oficial de referência: [downloads de despesas](https://portaldatransparencia.gov.br/download-de-dados/despesas) e [dicionário do documento de pagamento](https://portaldatransparencia.gov.br/dicionario-de-dados/pagamentos).

O Portal informa arquivos distintos de empenho, liquidação e pagamento e uma planilha de empenhos impactados por documento de pagamento. Um pagamento pode afetar mais de um empenho. O adaptador V1 cobre **apenas registros sintéticos com as colunas do documento de pagamento**, inseridos como objetos de fixture; ainda não lê CSV real. Não declara vínculo com PNCP, empenho ou prestação de serviço.

## Contrato executado

- ID: `br.portal-transparencia.download-despesas`;
- modo permitido: `OFFLINE_FIXTURE`; fonte federal, sem município padrão;
- entrada: linha sintética com código de pagamento, código e nome do órgão, código e nome do favorecido, data de emissão e valor convertido para R$;
- saída: envelope V1 com hash da linha e da normalização, referência ao catálogo oficial, período, campos, transformação e lacunas;
- valor: centavos inteiros a partir do formato decimal `1250,50`; datas `DD/MM/AAAA` válidas;
- URL: referência exata ao catálogo oficial, **não** URL nem prova de existência daquela linha no catálogo;
- localização: o shard UF é uma partição fictícia do piloto; a origem federal não comprova atribuição estadual ou municipal;
- lacunas explícitas: linha sintética, UF não comprovada, ligação com contratação ausente e possível multiplicidade de empenhos.

O relatório não incorpora a linha original nem a linha normalizada. A referência `fixture:sha256` serve apenas ao ensaio; uma captura oficial futura exige custódia privada real. Indisponibilidade não produz suspeita. Dois papéis independentes e o verificador adversarial levam o resultado até `HUMAN_REVIEW`; nenhuma conclusão adversa ou publicação é autorizada.

## Reprodução

```bash
node --test tests/multisource-offline-gate.test.mjs tests/portal-expenses-offline-adapter.test.mjs
npm run validate:multisource
npm run check:public
```

Fixture: `examples/multisource-offline-fixtures/portal-expenses-ac-al-am-v1.json`, com AC e AM disponíveis e AL indisponível sinteticamente.

## Próximo marco

M2: projetar chaves e relações PNCP ↔ execução financeira com quatro estados (`CONFIRMED`, `CANDIDATE`, `CONFLICTING`, `NOT_OBSERVED`). Preservar referência por campo, multiplicidade de empenhos, ambiguidade temporal e ausência de conclusão automática. Antes de correlacionar, ampliar a prova das relações oficiais entre documentos de pagamento e empenhos impactados.
