# ARCA — Checkpoint 016: fronteira pré-live preparada

Data: **2026-09-22**

Estado: **M4b CANÔNICO; M5 FASE A CANÔNICA; PREVIEW OFFLINE DO MANIFESTO PORTAL CANÔNICO; NENHUM GET PORTAL REAL EXECUTADO**

Main de referência antes deste checkpoint: `8ff9c6dbb9d6dad3b677c69072e04408b3cb2af6`

## Estado canônico consolidado

- M4b foi integrado pela PR #88 em `03d1465034de1151b7add59ab2b404a14f11fe72`; CI pós-merge `35798543860` verde.
- Vince/Edge Steward, migração futura do Work, desenho M5 e checkpoint 015 foram consolidados pela PR #93 em `9118146cf5d641c801f820de1a1df738f2ea9d20`; CI pós-merge `35798949814` verde.
- M5 Fase A foi integrado pela PR #94 em `f86630db5eead936d32b2a495dd7a5ffeb64ccb1`; CI pós-merge `35799032982` verde.
- Portal Manifest Preview V0.1 foi integrado pela PR #95 em `8ff9c6dbb9d6dad3b677c69072e04408b3cb2af6`; CI pós-merge `35799273391` verde.

## M5 Fase A agora disponível

O ARCA possui contrato executável para pré-registro de uma investigação PNCP + Portal e um gate pré-correlação que exige:

- exatamente duas fontes: PNCP e Portal;
- escopos e revisões previamente fixados;
- custódia privada com recibo e envelope verificáveis;
- normalização explicitamente concluída;
- retries zero;
- revisão humana obrigatória;
- publicação desligada;
- nenhuma autorização de rede derivada do manifesto.

Uma entrada custodial com `NORMALIZATION_FAILED`, `RAW_CUSTODIED` ou `SCHEMA_OBSERVED` bloqueia correlação sem produzir achado adverso.

## Preview offline do primeiro manifesto Portal

O ARCA agora consegue gerar o `scope_sha256` antes da execução live sem expor o código bruto no artefato e sem carregar credenciais de rede/custódia.

Fluxo aprovado:

```text
documento público real escolhido
        ↓
ARCA_PORTAL_DOCUMENT_CODE em Secret
        ↓
Portal Manifest Preview (OFFLINE)
        ↓
scope_sha256 + documentCodeSha256
        ↓
revisão humana
        ↓
autorização explícita separada
        ↓
um GET Portal controlado
```

O preview usa a confirmação `PORTAL_MANIFEST_PREVIEW_ONLY`. O GET live usa uma confirmação diferente, `PORTAL_DOCUMENT_GET_ONLY`. Executar o preview não autoriza rede.

## Fronteira atual

Todo trabalho estrutural necessário para chegar ao primeiro probe Portal está pronto e verde sem depender do ChatGPT Work.

O próximo avanço material exige informação concreta externa ao código: escolher **um documento público real** por critério documental neutro e disponibilizar seu código pelo secret apropriado. Depois o preview offline pode ser executado. O GET real continua exigindo autorização explícita separada após revisão do manifesto.

Não escolher alvo por suspeita, reputação política, ausência de registro ou acusação. O primeiro probe deve testar a infraestrutura, não uma narrativa adversa.

## O que permanece proibido/não provado

- nenhum GET Portal real ocorreu;
- nenhum schema Portal live foi observado;
- nenhuma correlação PNCP ↔ Portal live ocorreu;
- nenhuma pessoa/empresa foi classificada como irregular;
- classificador, publicação e encaminhamento automático permanecem desligados;
- Work não é requisito e pode continuar indisponível por cota;
- Edge Steward continua congelado;
- Vince continua roadmap futuro, não dependência do núcleo.

## Retomada

1. Ler este checkpoint.
2. Se ainda não houver documento real aprovado, parar na fronteira pré-live.
3. Quando houver documento aprovado, configurar somente `ARCA_PORTAL_DOCUMENT_CODE` para o preview.
4. Executar o workflow manual `ARCA Portal manifest preview` com `PORTAL_MANIFEST_PREVIEW_ONLY`.
5. Revisar `scopeHash`, revisão, endpoint, fase e budgets.
6. Pedir autorização explícita separada antes do workflow live.
7. No primeiro GET, capturar/custodiar e parar antes de correlação/classificação.
