# ADR-ARCA-0001 — Core local e CLI antes da interface

**Status:** aceito provisoriamente  
**Decisão:** o produto inicial é Core offline + CLI; interface gráfica, agente e rede são adaptadores posteriores.

## Motivo

O acervo anterior possuía interfaces e componentes públicos funcionais, mas não um núcleo único capaz de reconstruir o estado e impedir deriva ontológica. Fazer a interface primeiro ampliaria essa dívida.

## Consequências

- todo fluxo essencial precisa funcionar sem rede e sem IA;
- a interface futura chamará as mesmas operações públicas da CLI;
- Publisher, Registry e Resolver não são descartados, apenas desacoplados do núcleo.
