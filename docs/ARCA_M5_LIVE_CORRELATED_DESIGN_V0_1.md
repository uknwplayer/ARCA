# ARCA — Desenho M5: Live correlacionado limitado V0.1

Estado: **DESENHO PARA REVISÃO; SEM EXECUÇÃO LIVE; DEPENDE DO ACEITE DE M4**.

Data: **2026-09-22**

## Objetivo

Provar uma única investigação técnica fechada usando duas famílias de fonte pública adquiridas ao vivo em ciclos separados, correlacionadas somente depois de custódia privada durável verificada, mantendo dois agentes independentes, verificação adversarial, revisão humana e publicação desligada.

M5 não é um ciclo nacional, não é monitoramento contínuo e não produz veredito, acusação ou encaminhamento automático.

## Pré-condições obrigatórias

1. M4b integrado em `main` com CI pós-merge verde.
2. Primeiro acesso live do Portal concluído e registrado em checkpoint próprio, ou resultado de falha/indisponibilidade corretamente modelado.
3. Aquisição PNCP live já comprovada ou repetida apenas se a revisão M5 exigir escopo novo.
4. Cofre privado durável pré-validado para cada fonte.
5. Nenhum dado bruto live no repositório público.
6. Classificador e publicação continuam desligados durante aquisição e custódia.

## Unidade de investigação

O M5 opera sobre exatamente uma investigação pré-registrada com:

- pergunta neutra e testável;
- uma contratação ou relação documental explicitamente selecionada;
- período e território definidos;
- fontes permitidas;
- identificadores necessários minimizados;
- orçamento de requests, bytes, registros e tempo;
- critérios de parada;
- revisão humana obrigatória.

Não selecionar alvo por acusação, reputação ou ausência de registro. O caso deve ser definido por escopo documental reproduzível.

## Sequência obrigatória

```text
PRE-REGISTER
   ↓
PNCP LIVE CAPTURE
   ↓
PNCP PRIVATE CUSTODY VERIFIED
   ↓
PORTAL LIVE CAPTURE
   ↓
PORTAL PRIVATE CUSTODY VERIFIED
   ↓
OBSERVED-SCHEMA NORMALIZATION
   ↓
CORRELATION
   ↓
TWO INDEPENDENT AGENTS
   ↓
ADVERSARIAL VERIFICATION
   ↓
HUMAN_REVIEW
```

Nenhuma seta pode ser pulada. Falha de custódia em qualquer fonte interrompe o ciclo.

## Aquisição

PNCP e Portal devem ser consultados em runs separados. Cada run conserva seu próprio manifesto, revisão, hash de escopo, orçamento, recibo e checkpoint.

O M5 não reutiliza automaticamente um resultado antigo só porque o identificador parece compatível. Reuso exige prova de escopo e proveniência suficientes para a investigação atual.

## Normalização real

Dados live não podem ser forçados a caber em fixtures sintéticas. O primeiro parser real deve ser construído a partir do schema efetivamente observado e de documentação oficial, com testes próprios.

Cada transformação precisa preservar ligação ao artefato custodial de origem por hash.

Estados mínimos de parsing:

- `RAW_CUSTODIED`;
- `SCHEMA_OBSERVED`;
- `NORMALIZED`;
- `NORMALIZATION_FAILED`.

`NORMALIZATION_FAILED` não significa ausência de dado nem irregularidade.

## Correlação

Somente registros em `NORMALIZED` e vinculados à custódia podem entrar no correlator.

Estados epistêmicos permanecem:

- `CONFIRMED`;
- `CANDIDATE`;
- `CONFLICTING`;
- `NOT_OBSERVED`.

Regras:

- nome ou valor isolado nunca confirma identidade;
- proximidade temporal não prova causalidade;
- documento forte pode confirmar apenas o vínculo documental representado;
- `NOT_OBSERVED` não significa desaparecimento, desvio ou irregularidade;
- evidência contrária deve permanecer ligada à relação.

## Dois agentes independentes

O M5 exige no mínimo dois papéis independentes sobre o mesmo digest imutável de evidência/correlação:

- `PROVENANCE_ANALYST`: verifica origem, integridade, lacunas e ligação documental;
- `COMPARABILITY_ANALYST`: testa comparabilidade, reconciliação financeira e explicações alternativas.

Eles não podem editar a evidência, o correlator ou o rascunho um do outro antes da entrega independente.

ChatGPT Work não é requisito. Os papéis podem ser executados pelo runtime de agentes já disponível no ARCA ou por executores admitidos equivalentes.

## Verificação adversarial

O verificador deve tentar invalidar a conclusão operacional buscando, no mínimo:

- documento incompatível;
- período divergente;
- duplicidade/estorno;
- relação baseada apenas em nome/valor;
- fonte indisponível interpretada como ausência;
- schema drift;
- origem não custodial;
- contraprova omitida;
- extrapolação de federal para estadual/municipal;
- dupla contagem financeira.

O verificador produz desafios e estados de revisão, nunca acusação automática.

## Saída do M5

A saída pública/sanitizada da execução deve conter somente:

- `investigationId`;
- digests dos manifestos;
- hashes de custódia;
- contagens sanitizadas;
- estados de normalização;
- relações e estados epistêmicos hash-bound;
- resultado dos dois agentes;
- desafios adversariais;
- estado final `HUMAN_REVIEW`;
- métricas de cobertura/lacunas.

Bytes brutos, token, código de documento sensível, dados pessoais desnecessários e artefatos privados permanecem fora.

## Estados de parada

Interromper o M5 em qualquer um destes casos:

- escopo não pré-registrado;
- revisão/hash divergente;
- fonte ou endpoint fora da allowlist;
- segredo/custódia ausente ou inválido;
- resposta excedendo budget;
- schema real incompatível sem parser revisado;
- relação não ancorada em evidência;
- contraprova material não representada;
- tentativa de ativar publicação/classificador/encaminhamento;
- necessidade de dado protegido para continuar.

Se a trilha pública terminar, registrar a lacuna conforme o método M5-R futuro; não inferir culpa.

## Critério de aceite

M5 é aceito somente quando existir uma execução reproduzível com:

1. uma investigação pré-registrada;
2. duas aquisições live separadas;
3. custódia privada verificada para ambas;
4. normalização baseada em schema observado;
5. correlação documental vinculada aos artefatos;
6. dois agentes independentes;
7. verificação adversarial;
8. `HUMAN_REVIEW` registrado;
9. publicação automática `false`;
10. nenhuma conclusão adversa automática.

## Relação com M5-R

M5 prova a cadeia técnica live. M5-R só pode começar depois do aceite M5 e transforma uma investigação revisada em dossiê técnico reproduzível, mantendo `PUBLIC_TRAIL_END`, minimização e decisão humana separada para exportação/encaminhamento.
