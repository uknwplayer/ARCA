# ADR-ARCA-0008 — Aquisição fora do Core

- **Status:** aceito
- **Decisão:** rede, leitura de arquivo, OCR e conectores pertencem a adaptadores externos; o Core recebe somente uma operação revisada.

## Contexto

Dar ao Core acesso a rede, credenciais ou conteúdo hostil ampliaria sua superfície de ataque e misturaria captura com julgamento epistêmico.

## Decisão

O pacote `@arca/acquisition` preserva bytes e custódia em armazenamento separado. Ele produz proposta de `DOC` compatível com o Agent Bundle. Nenhum caminho do adaptador aponta para o event log canônico.

## Consequências

- o Core continua offline e determinístico;
- conectores futuros são substituíveis;
- aquisição não implica verdade;
- falha ou remoção do Workbench não altera a custódia;
- aplicação canônica permanece decisão humana.
