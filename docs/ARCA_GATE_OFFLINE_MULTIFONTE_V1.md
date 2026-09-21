# ARCA — Gate Offline Multifonte V1

Estado: **IMPLEMENTADO EM BRANCH; VALIDAÇÃO DE CI PENDENTE**

Escopo: **offline, sintético, sem rede e sem publicação**

## Objetivo

Provar que a investigação nacional não depende do formato do PNCP. O PNCP é o primeiro adaptador executável, enquanto o Core recebe fontes públicas por um contrato comum, preserva proveniência em envelopes verificáveis e encaminha análise apenas para revisão humana.

## Componentes

1. `Public Source Adapter V1`: descreve autoridade, classe, acesso, origem permitida, formatos, cobertura, limitações e modos executáveis.
2. `Evidence Envelope V1`: preserva identificador, jurisdição, URL oficial, horário, hashes bruto e normalizado, transformação, referência de custódia, cobertura e lacunas.
3. `Public Source Registry V1`: registra oito famílias oficiais. Somente `br.pncp.public-api` executa `OFFLINE_FIXTURE`; as outras permanecem `DECLARED_ONLY`.
4. `PNCP Offline Adapter V1`: normaliza fixtures sintéticas, recusa origem não autorizada e não incorpora bytes brutos no relatório.
5. `Multisource Offline Gate V1`: limita o ciclo a no máximo três UFs, isola indisponibilidade, deduplica registros, executa dois papéis independentes, verifica adversarialmente e usa a fila investigativa existente.

## Fluxo provado

`fixture PNCP → adaptador → envelope → deduplicação → analista de proveniência + analista de comparabilidade → verificação adversarial → HUMAN_REVIEW`

O avanço para `HUMAN_REVIEW` não representa achado adverso. Neste piloto, o analista de comparabilidade registra explicitamente que uma segunda fonte é necessária antes de qualquer conclusão cruzada.

## Fixture de controle

- UFs: `AC`, `AL`, `AM`;
- `AC`: duas observações idênticas, reduzidas a uma evidência;
- `AL`: `SOURCE_UNAVAILABLE` sintético, preservado como lacuna e `suspicion=false`;
- `AM`: uma observação disponível;
- resultado: três observações, duas evidências deduplicadas, uma lacuna explícita;
- município padrão: `null`.

## Invariantes

- rede bloqueada;
- publicação bloqueada;
- somente origens HTTPS declaradas no registro;
- falha da fonte não produz suspeita;
- dados ausentes não viram evidência;
- material bruto não entra no relatório;
- dois agentes têm IDs e papéis distintos e recebem o mesmo digest imutável;
- resultado adversarial não é conclusão de culpa;
- revisão humana obrigatória;
- fontes `DECLARED_ONLY` não podem executar.

## Verificação local

```bash
npm ci
node --test tests/multisource-offline-gate.test.mjs
npm run validate:multisource
npm test
npm run check:public
```

## Limites

Este gate não consulta o PNCP ao vivo, não ativa o Portal da Transparência, não correlaciona pagamento real, não mede precisão do classificador, não publica e não declara investigação nacional contínua. A fixture é sintética e existe apenas para provar contratos e estados.

## Próximo gate

Implementar o adaptador offline do Portal da Transparência e provar a correlação estrutural:

`contratação PNCP → possível execução financeira → fornecedor/órgão/período → divergências e lacunas → revisão humana`.

Não haverá inferência automática de irregularidade quando uma correlação não for encontrada.
