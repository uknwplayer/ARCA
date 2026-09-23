# ARCA — Checkpoint 031: Vince V5 Work Read-only Availability Proof 008

Data: **2026-09-23**.

Estado: **VINCE V5 FOUNDATION INTEGRADA E EXERCITADA AO VIVO EM MODO READ-ONLY; SUPERFÍCIE WORK/GITHUB ALCANÇÁVEL; DISPONIBILIDADE DO EXECUTOR CONTINUA INCONCLUSIVE; NENHUMA ROTA OU EXECUÇÃO FOI DISPARADA; EDGE STEWARD CONGELADO**.

## Entradas canônicas

- PR #137 — V5 endpoint availability/routing foundation
- commit #137: `cc2a5c4893c1cc5182068e494448677fb3a1a18e`
- CI #137: `35832985503` — success
- CI pós-merge #137: `35833122256` — success
- PR #139 — Work read-only probe 008
- commit #139: `1bc71d7cabc336d564c3f04e8b5ea8e1c97d120f`
- CI #139: `35833238838` — success
- CI pós-merge #139: `35833345751` — success
- issue de prova: #138
- run live: `35833356337` — success
- job live: `107090893357` — success
- proof document: [ARCA_VINCE_V5_WORK_READONLY_PROOF_008.md](../ARCA_VINCE_V5_WORK_READONLY_PROOF_008.md)

## V5 implementado

A foundation V0.1 adicionou um modelo conservador de disponibilidade sobre o `ExecutionEndpointRegistry`.

Estados:

- `AVAILABLE`
- `UNREACHABLE`
- `INCONCLUSIVE`

Regras relevantes:

1. heartbeat acessível não equivale a executor disponível;
2. em V0.1, uma rota `AVAILABLE` exige ACK recente e correlacionado;
3. ACK ausente ou expirado permanece `INCONCLUSIVE`;
4. erro genérico de probe permanece `INCONCLUSIVE`;
5. somente `available:false` explícito do heartbeat pode produzir `UNREACHABLE`;
6. observação mais nova prevalece sobre evidência positiva anterior;
7. route selection filtra capability, exige evidência fresca e não faz dispatch.

## Prova live 008

Alvo:

- `chatgpt-work`
- PR #90
- ref `test/work-access-check-v2`

O probe foi read-only. Nenhum arquivo de wake foi escrito.

Heartbeat:

- `state=INCONCLUSIVE`
- `reason=SURFACE_REACHABLE_EXECUTION_UNPROVEN`
- `surfaceReachable=true`
- `wakeAcknowledged=false`
- `routeEligible=false`

Route selection:

- 1 candidato;
- 0 elegíveis;
- `selectedEndpointId=null`;
- `dispatchPerformed=false`.

O resultado demonstra que Vince consegue observar uma superfície endpoint real sem transformar reachability em confiança ou disponibilidade.

## Work continua candidato, não disponível

A leitura correta após a prova é:

```text
GitHub/PR surface = reachable
ChatGPT Work execution availability = INCONCLUSIVE
Vince route = not eligible
```

Nenhum `WORK-WAKEUP-ACK` canônico recente foi usado nesta prova.

Ausência de ACK não significa que o Work esteja indisponível ou que nenhuma execução possa ocorrer por outra superfície. Significa apenas que a rota configurada não possui evidência recente suficiente para V5 selecioná-la.

## Limites preservados

- nenhuma escrita no PR #90;
- nenhum wake;
- nenhum ACK query;
- nenhum job Work;
- nenhum Termux;
- nenhum retry/failover;
- nenhuma ampliação de trust;
- nenhum acesso Portal/PNCP;
- Edge Steward continua congelado.

## Próximo gate

O próximo avanço V5 para Work é uma **prova separada de wake + ACK correlacionado**, limitada e reversível, caso esse teste seja autorizado/executado.

Alternativamente, V5 pode integrar outro Execution Endpoint que já produza disponibilidade observável forte.

Não promover Work para `AVAILABLE` apenas porque o heartbeat da PR passa.

## Retomada

Ler:

1. este checkpoint;
2. `docs/ARCA_VINCE_V5_WORK_READONLY_PROOF_008.md`;
3. `docs/ARCA_VINCE_V5_ENDPOINT_AVAILABILITY_V0_1.md`;
4. checkpoint 030 para V4.1.1;
5. seção Vince do roadmap.

O ponto seguro atual é V5 read-only live-proven, com Work ainda `INCONCLUSIVE`.
