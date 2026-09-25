# ARCA — Integração Sixtyfour Intelligence V0.1

Status: **PROPOSTA / NÃO IMPLEMENTADA / ZERO CHAMADAS / ZERO CUSTO**

Data: **2026-09-25**

## Objetivo

Definir como o ARCA poderá usar o Sixtyfour Intelligence como provedor externo e opcional de enriquecimento de entidades, sem torná-lo dependência do núcleo e sem confundir informação de terceiro com evidência primária.

O Sixtyfour deve entrar somente depois da coleta e normalização das fontes próprias do ARCA, como PNCP, Portal da Transparência e demais fontes oficiais admitidas.

Fluxo conceitual:

```text
fonte oficial/publica
  -> normalizacao ARCA
  -> entidade canonica
  -> roteador de enriquecimento
  -> provedor externo opcional
  -> resultado bruto privado
  -> mapeamento/proveniencia
  -> verificacao em fonte independente quando possivel
  -> relacao/claim com estado epistemico
  -> revisao humana
```

## Papel do provedor

O Sixtyfour poderá ser usado para gerar pistas estruturadas sobre pessoas, empresas e organizações, por exemplo:

- histórico profissional e organizacional;
- administradores, executivos e papéis públicos/profissionais;
- relações empresariais ou profissionais encontradas em fontes abertas;
- informações corporativas adicionais;
- localização de novas fontes e referências para investigação posterior.

O resultado do provedor **não é prova de irregularidade**, não recebe status de fato oficial apenas por ter sido retornado pelo serviço e não pode gerar acusação automática.

## Princípios obrigatórios

1. **Opcionalidade** — o ARCA deve continuar funcional sem Sixtyfour.
2. **Fonte primária primeiro** — dados oficiais e fontes públicas diretas têm prioridade.
3. **Proveniência explícita** — todo resultado deve registrar provedor, operação, instante, escopo solicitado e referências retornadas quando disponíveis.
4. **Separação epistêmica** — descoberta, alegação, relação candidata, relação corroborada e evidência oficial devem permanecer estados distintos.
5. **Confirmação independente** — quando houver fonte primária disponível, o ARCA deve tentar confirmar a pista nela antes de promovê-la.
6. **Revisão humana** — nenhuma conclusão adversa ou publicação sobre pessoa/empresa deve ser automatizada a partir desse enriquecimento.
7. **Privacidade e minimização** — coletar somente os campos necessários para a hipótese investigativa legítima.
8. **Segredos fora do repositório** — API keys, tokens, respostas privadas e material sensível nunca entram no repositório público.
9. **Fail-closed** — custo desconhecido, escopo ambíguo, identidade incerta ou política incompatível bloqueiam a execução.
10. **Auditabilidade** — toda execução futura deve produzir recibo sanitizado e vínculo com a cadeia de custódia aplicável.

## Controle monetário

Chamadas potencialmente cobradas devem permanecer bloqueadas por padrão.

A execução futura só poderá ocorrer quando houver:

- provedor explicitamente habilitado;
- estimativa ou confirmação do custo disponível no momento da execução;
- autorização humana específica para gasto;
- teto de custo da operação;
- quantidade máxima de entidades/resultados;
- ausência de retry automático cobrado, salvo autorização separada.

Preços, tiers e condições comerciais não devem ser congelados nesta especificação. Devem ser reconsultados no momento de uma futura ativação.

## Escopo V0.1 permitido

A primeira implementação, se aprovada futuramente, deve começar pequena:

- inteligência de empresa;
- inteligência profissional de pessoa ligada a uma entidade investigada;
- descoberta de fontes/relações para posterior verificação;
- uma entidade por execução de prova;
- retorno estruturado limitado aos campos pré-registrados.

## Escopo V0.1 bloqueado

Até revisão específica, ficam bloqueados:

- busca reversa por telefone ou e-mail;
- coleta de telefone pessoal;
- coleta de e-mail pessoal sem necessidade demonstrada;
- enriquecimento em massa;
- monitoramento de dark web;
- tier de investigação profunda/enterprise;
- inferência automática de culpa, risco criminal, intenção ou probabilidade de irregularidade;
- publicação automática;
- uso do provedor como substituto de fonte oficial.

## Modelo de confiança

Um item retornado pelo Sixtyfour deve começar como `THIRD_PARTY_LEAD`.

Promoções possíveis exigem evidência adicional:

```text
THIRD_PARTY_LEAD
  -> INDEPENDENT_SOURCE_FOUND
  -> CORROBORATED_RELATION
  -> OFFICIAL_SOURCE_CONFIRMED
```

Nem `THIRD_PARTY_LEAD` nem `CORROBORATED_RELATION` equivalem a irregularidade.

Conflitos devem ser preservados, nunca descartados silenciosamente.

## Contrato de integração

O contrato inicial é definido em:

`schemas/arca-external-enrichment-v1.schema.json`

Ele descreve:

- provedor;
- tipo de entidade;
- identificadores mínimos;
- campos solicitados;
- finalidade;
- política de custo;
- política de dados;
- exigência de revisão humana;
- estado de execução.

Nesta fase o schema é apenas um contrato de projeto. Não existe cliente HTTP, workflow, secret, chamada externa ou adapter executável.

## Integração futura com o roteador

Quando implementado, o roteador deve obedecer à ordem:

```text
dados já presentes no ARCA
  -> fontes oficiais/gratuitas
  -> OSINT gratuita admitida
  -> resultado suficiente?
       sim -> encerrar enriquecimento
       não -> avaliar provedor externo
  -> custo > 0?
       sim -> exigir autorização humana
  -> executar dentro do budget
  -> custodiar
  -> validar
  -> correlacionar
```

O roteador não pode elevar prioridade de uma fonte apenas porque ela é paga.

## Condições para implementação

Antes de criar qualquer adapter executável:

1. revisar a documentação e política comercial atuais do provedor;
2. definir onde o segredo será armazenado;
3. implementar budget e trava de autorização monetária;
4. criar fixtures sintéticas sem rede;
5. validar o schema e estados epistêmicos offline;
6. definir recibo sanitizado;
7. executar um probe de uma única entidade somente após autorização humana;
8. interromper diante de drift, identidade ambígua, custo inesperado ou resposta excessiva.

## Estado atual

- especificação: **PROPOSTA**;
- schema: **DEFINIDO NESTA ETAPA**;
- adapter: **INEXISTENTE**;
- credencial: **NÃO CONFIGURADA PELO ARCA**;
- rede: **NÃO USADA**;
- chamadas Sixtyfour: **0**;
- custo gerado por esta integração: **0**;
- publicação: **DESLIGADA**.

## Próximo gate

Criar, em ciclo separado e somente após aprovação humana, uma fixture sintética e um validador offline para o contrato de enriquecimento. Esse gate não deve conter cliente de rede nem segredo.
