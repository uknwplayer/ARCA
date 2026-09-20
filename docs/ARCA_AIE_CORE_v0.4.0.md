# ARCA AIE Core v0.4.0 — perfil portado para Machine Bridge V3

## Estado desta linha principal

Este documento descreve apenas as capacidades presentes no `main` após o porte controlado do AIE para a infraestrutura V3.

Implementado neste perfil:

- baseline numérico robusto e reproduzível;
- detecção exploratória de outliers robustos;
- detecção de baixa competição recorrente;
- detecção de concentração de valor;
- hipóteses concorrentes, incluindo explicações legítimas e hipótese de erro de dados;
- auditoria adversarial de achados;
- proposta de caso somente após achado investigável sobreviver à auditoria;
- marcação explícita de `PUBLIC_TRAIL_END` antes de dados restritos;
- normalização offline de registros de contratações públicas;
- normalização de moeda, CNPJ, participantes e percentual de aditivos sem inventar campos ausentes;
- resolução de fornecedores somente por CNPJ normalizado exato;
- detector exploratório de carga de aditivos;
- perfil de contratação combinando preço, competição, concentração e aditivos;
- execução remota bounded via Machine Bridge V3 por `aie.analyze` e `aie.procurement-profile`;
- revisão humana obrigatória em achados e resultados analíticos.

Ainda **não portado para o main V3**:

- conector PNCP e aquisição de rede;
- descoberta/aprofundamento municipal;
- avaliação cega D1/D2 e pilotos públicos;
- daemons e infraestrutura remota legada da branch histórica.

A branch histórica `feat/aie-0.4-foundation` permanece como fonte de referência para esses módulos, mas não deve ser confundida com o estado executável atual do `main`.

## Finalidade

O AIE Core produz sinais analíticos exploratórios sobre conjuntos de registros fornecidos pelo operador. Ele normaliza dados, constrói baselines, detecta padrões quantitativos, formula hipóteses alternativas e explicita lacunas que precisam de verificação.

O AIE Core **não** declara culpa, crime, fraude ou irregularidade jurídica como fato. Um achado AIE não é uma conclusão jurídica nem probatória. Todo achado mantém `humanReviewRequired: true`.

## Invariantes

1. **Determinismo.** Mesmos registros e parâmetros produzem os mesmos identificadores e resultados analíticos.
2. **Comparabilidade antes de inferência.** Desvios quantitativos exigem revisão de objeto, unidade, quantidade, período e condições relevantes.
3. **Hipóteses concorrentes.** O sistema registra explicações de risco, explicações legítimas e possível erro de dados.
4. **Sem promoção automática ao Core probatório.** As ações AIE não gravam no event log do Core e não criam evidência PRO automaticamente.
5. **Revisão humana obrigatória.** O produto analítico é material de triagem e investigação, não decisão final.
6. **Limite de dados públicos.** Quando a continuação depender de sigilo ou dado privado, o AIE pode registrar `PUBLIC_TRAIL_END`, mas não contornar o limite.
7. **Execução bounded.** Cada ação remota aceita no máximo 10.000 registros por job.
8. **Sem shell remoto.** Parâmetros AIE são dados; não são interpretados como comandos.
9. **Sem vínculo por semelhança nominal.** A resolução de fornecedor no perfil de contratações une aliases somente quando há CNPJ normalizado exatamente igual.
10. **Lacuna permanece lacuna.** Campo ausente ou inválido gera aviso de normalização e não é preenchido por inferência.

## Detectores portados

### RISK-PRICE-OUTLIER-001

Compara valores numéricos contra baseline robusto, usando mediana/MAD quando possível e desvio-padrão como fallback. Um desvio elevado é sinal de revisão, não prova de sobrepreço.

### RISK-LOW-COMPETITION-001

Sinaliza recorrência de baixa quantidade de participantes dentro de um grupo comparável. Devem ser consideradas modalidade, especialização, mercado disponível e requisitos de habilitação.

### RISK-CONCENTRATION-001

Mede concentração de valor por entidade dentro do universo fornecido. Concentração pode decorrer de escala, especialização, composição do universo ou contratos de grande porte.

### RISK-ADDITIVE-BURDEN-001

Sinaliza percentual acumulado de aditivos acima do limiar de triagem. O sinal exige análise dos termos aditivos, justificativas, base legal, escopo e cálculo sobre o contrato original; não é uma conclusão de irregularidade.

## Normalização de contratações públicas

`normalizeProcurementRecord` produz `arca-aie-procurement-record-v1` a partir de registros fornecidos pelo operador. O normalizador reconhece formas conhecidas de campos para processo, fornecedor, valor, competição, aditivos, modalidade, objeto e publicação.

A normalização preserva referências de origem e registra avisos como `missing-supplier-cnpj`, `invalid-amount` e `missing-participant-count`. Um fornecedor sem CNPJ permanece não resolvido. Nomes diferentes podem ser tratados como aliases apenas quando associados ao mesmo CNPJ exato.

`buildProcurementProfile` combina os detectores atualmente portados e devolve contagens, achados, entidades resolvidas e entidades não resolvidas, sempre com `humanReviewRequired: true`.

## Machine Bridge V3

### `aie.analyze`

Requer a capacidade `aie`. Recebe `params.records` e, opcionalmente, seleção dos detectores genéricos e parâmetros.

### `aie.procurement-profile`

Requer a capacidade `aie`. Recebe registros brutos de contratações em `params.records`, normaliza-os offline e produz um perfil analítico. Pode receber `params.sourceRef` e parâmetros de limiar em `params.options`.

Exemplo conceitual:

```json
{
  "format": "arca-remote-job-v3",
  "protocolVersion": 3,
  "jobId": "procurement-example-001",
  "action": "aie.procurement-profile",
  "requires": ["aie"],
  "params": {
    "sourceRef": "fonte-publica-importada",
    "records": [
      {
        "id": "R1",
        "numeroProcesso": "PROC-001",
        "supplier": {"cnpj": "11.111.111/0001-11", "name": "Fornecedor Exemplo"},
        "amount": "R$ 100,00",
        "participantCount": 3,
        "additivePercent": 0
      }
    ]
  }
}
```

A resposta usa `arca-aie-procurement-analysis-v1`, inclui o perfil e mantém `humanReviewRequired: true`. A ação não acessa PNCP ou qualquer outra rede por conta própria.

## Próximo porte

O próximo bloco pode reconciliar o conector PNCP e a aquisição pública controlada. Essa camada deverá manter aquisição separada da inferência, preservar referências de origem e cadeia de custódia, aplicar limites de rede e alimentar o AIE somente com dados públicos obtidos pelo fluxo autorizado.
