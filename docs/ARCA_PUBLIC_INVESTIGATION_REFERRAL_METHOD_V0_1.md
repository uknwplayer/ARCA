# ARCA — Método de Investigação Pública e Dossiê de Encaminhamento V0.1

Status: **ESPECIFICAÇÃO NORMATIVA PROPOSTA — IMPLEMENTAÇÃO EXECUTÁVEL PENDENTE**

Data: **2026-09-22**

Marco planejado: **M5-R — Public Investigation & Referral Dossier**

## 1. Propósito

Este documento formaliza como o ARCA deve transformar uma pergunta de interesse público em uma apuração reproduzível baseada em fontes legalmente acessíveis e, quando a trilha pública terminar, em um `Referral Dossier` tecnicamente apto a revisão e eventual encaminhamento humano.

O método estende a fronteira definida em `ARCA_INVESTIGATIVE_BOUNDARY_V0_1.md`; não a substitui nem amplia. O ARCA pode localizar, adquirir, preservar, normalizar, relacionar, testar e explicar evidências públicas. Ele não adquire poder policial, fiscal, judicial ou coercitivo.

## 2. Regra de autoridade

O método é **public-record first** e **lawful-access only**.

O ARCA pode:

- consultar fontes públicas e registros acessíveis por meios legais;
- formular e acompanhar pedidos de acesso à informação quando autorizados pelo Criador;
- receber material fornecido voluntariamente por fonte legítima, preservando origem e restrições;
- identificar inconsistências, relações, hipóteses concorrentes e lacunas probatórias;
- indicar quais dados protegidos seriam necessários para confirmar ou refutar uma hipótese;
- sugerir a classe de autoridade competente para avaliar um encaminhamento.

O ARCA não pode:

- acessar diretamente contas bancárias, declarações fiscais completas, comunicações privadas, localização, credenciais, prontuários ou processos sigilosos sem base jurídica e autoridade próprias;
- representar lacuna, sigilo, indisponibilidade ou ausência de registro como prova de culpa;
- emitir veredito, atribuir crime, produzir denúncia automática ou requerer autonomamente quebra de sigilo;
- protocolar representação ou divulgar dossiê sem decisão humana específica e registrada.

## 3. Não objetivos da V0.1

Esta versão não implementa schema, validador, renderer, protocolo eletrônico, integração com autoridades ou execução automática. Também não define que uma inconsistência é ilícita nem substitui análise jurídica, contábil, jornalística, administrativa ou pericial qualificada.

O dossiê é um instrumento técnico de encaminhamento. Não é sentença, denúncia, parecer jurídico, laudo pericial ou ordem de investigação.

## 4. Classes de acesso

| Classe | Exemplos | Tratamento pelo ARCA |
|---|---|---|
| Fonte aberta | portais oficiais, contratos, despesas, diários, dados eleitorais, processos publicamente acessíveis | Aquisição direta limitada, com proveniência e custódia |
| Registro público condicionado | juntas comerciais, certidões, consultas sujeitas a identificação ou taxa | Acesso somente pela interface legal e sob escopo aprovado |
| Transparência passiva | processo administrativo, memória de cálculo, documento não publicado | Preparar pedido de acesso; envio depende de ação humana autorizada |
| Material voluntário | documento entregue pelo titular, denunciante legítimo ou custodiante autorizado | Tratar como alegação ou evidência conforme autenticação, origem e cadeia de custódia |
| Dado protegido | bancário, fiscal, telemático, médico, localização, comunicação ou processo sigiloso | Não adquirir; registrar necessidade probatória e possível autoridade competente |
| Origem ilícita ou acesso contornado | credencial alheia, invasão, interceptação, vazamento comprado ou material obtido por engano | Rejeitar, interromper e registrar a razão sem incorporar o conteúdo |

Publicação anterior na internet não elimina automaticamente proteção jurídica, pertinência ou risco. Dados pessoais publicamente acessíveis continuam sujeitos a minimização, finalidade, contexto e controles de publicação.

## 5. Princípios obrigatórios

1. **Pergunta antes da coleta:** toda aquisição deve responder a pergunta, período, território, entidades e finalidade previamente delimitados.
2. **Fonte oficial prioritária:** fontes secundárias podem gerar leads, mas fatos documentais devem preferir registros oficiais ou ser rotulados conforme sua origem.
3. **Proveniência contínua:** observações materiais preservam localizador, fonte, identificador documental, instante de recuperação, método e hash quando aplicável.
4. **Separação epistêmica:** alegação, observação, relação, inconsistência, hipótese, confirmação oficial e fato adjudicado são classes diferentes.
5. **Minimização:** coletar e reter apenas os campos necessários à pergunta, custódia e verificação.
6. **Contraprova preservada:** evidência incompatível, explicações alternativas e resultados negativos não podem ser apagados para fortalecer uma narrativa.
7. **Sem dupla contagem:** correções, estornos, reembolsos, parcelas e registros replicados entre bases precisam ser reconciliados antes da soma.
8. **Ausência não é culpa:** ausência de registro pode significar atraso, escopo inadequado, indisponibilidade, cobertura parcial ou inexistência; nunca irregularidade por si só.
9. **Revisão humana:** qualquer afirmação reputacional, exportação ou encaminhamento exige revisão humana explícita.
10. **Fail-closed:** dúvida sobre legalidade, autoridade, classificação, custódia ou publicação interrompe a etapa afetada.

## 6. Fluxo obrigatório de investigação pública

### 6.1 Delimitar pergunta, período e escopo

O registro inicial deve declarar:

- pergunta investigativa neutra;
- interesse público documentado;
- período e território;
- pessoas, órgãos, empresas ou programas estritamente necessários;
- fontes previstas e classes de acesso;
- critérios de inclusão, exclusão e parada;
- orçamento de páginas, registros, bytes, tempo e tentativas;
- risco de dados pessoais ou protegidos;
- resultado esperado: levantamento, reconciliação, teste de hipótese ou preparação de encaminhamento.

Perguntas acusatórias devem ser reformuladas em testes verificáveis. Exemplo: “houve desvio?” não é uma consulta operacional; “os pagamentos publicados podem ser reconciliados com contratos, empenhos e fornecedores no período?” é.

### 6.2 Mapear e priorizar fontes

A ordem padrão é:

1. fonte oficial primária;
2. registro público complementar;
3. documento administrativo obtido legalmente;
4. fonte secundária com reputação e autoria identificáveis;
5. material voluntário, tratado inicialmente como alegação.

Para cada fonte, registrar cobertura, granularidade, atualização, limitações, termos de acesso e identificadores disponíveis. A prioridade da fonte não torna seu conteúdo infalível.

### 6.3 Adquirir com cadeia de custódia

Toda aquisição deve obedecer ao contrato de aquisição do ARCA:

- fonte e método permitidos;
- autorização e limites pré-registrados quando houver rede;
- bytes originais no cofre privado apropriado, nunca no repositório público;
- SHA-256 e eventos de custódia;
- transformação derivada vinculada ao artefato de entrada;
- recibo sanitizado sem segredo ou dado protegido;
- falha isolada e nenhuma ampliação automática de escopo.

### 6.4 Classificar a natureza econômica e institucional

Antes de somar valores, cada registro deve ser classificado, no mínimo, como:

- remuneração ou benefício pessoal;
- reembolso ou indenização condicionado a despesa;
- custo operacional de gabinete ou mandato;
- remuneração de equipe ou encargo patronal;
- recurso eleitoral ou partidário;
- emenda, transferência, convênio ou orçamento indicado;
- contratação ou pagamento a fornecedor;
- patrimônio autodeclarado;
- valor privado declarado em fonte pública;
- natureza ainda não determinada.

Recursos vinculados a gabinete, campanha, emenda, contratação ou equipe não podem ser descritos como renda pessoal sem prova documental dessa conversão.

### 6.5 Normalizar, reconciliar e impedir dupla contagem

O ARCA deve:

- preservar valor bruto, moeda, data, competência e identificador da fonte;
- separar valor empenhado, liquidado, pago, reembolsado, devolvido, glosado e cancelado;
- identificar estornos e lançamentos substitutos;
- detectar o mesmo evento replicado em múltiplos portais;
- distinguir total autorizado, executado e efetivamente pago;
- explicitar períodos parciais;
- registrar método de cálculo e arredondamento;
- manter totais pessoais separados dos custos do mandato e de valores apenas politicamente associados.

### 6.6 Construir relações verificáveis

Entidades e eventos podem ser relacionados por identificadores fortes, documentos e proveniência. Nome, valor, proximidade temporal, endereço ou coincidência isolada geram no máximo candidatos.

Cada relação deve conter:

- sujeitos e objetos envolvidos;
- tipo e direção;
- evidência de suporte;
- evidência contrária;
- força e estado epistêmico;
- explicações alternativas;
- revisor e histórico de mudanças.

### 6.7 Formular hipóteses concorrentes e contraprovas

Para cada inconsistência material, registrar ao menos:

- hipótese principal em linguagem testável;
- explicações alternativas plausíveis;
- dado que confirmaria cada hipótese;
- dado que a refutaria;
- fontes já consultadas;
- risco de falso positivo;
- estado atual, sem converter probabilidade em fato.

Uma hipótese que exige dado protegido continua hipótese. Sua relevância não autoriza obtenção clandestina.

### 6.8 Registrar `PUBLIC_TRAIL_END`

`PUBLIC_TRAIL_END` é o estado em que a trilha legalmente acessível foi explorada dentro do escopo e a próxima pergunta material depende de dado indisponível, protegido, não publicado, fora da competência da fonte ou sujeito a providência humana externa.

O registro deve informar:

- pergunta que permaneceu aberta;
- buscas e fontes tentadas;
- cobertura e limitações conhecidas;
- razão de parada;
- classe do dado necessário, sem reproduzir conteúdo protegido;
- base de acesso que seria necessária em termos gerais;
- classe de autoridade ou custodiante potencialmente competente;
- alternativas públicas ainda possíveis;
- impacto da lacuna sobre cada hipótese.

`PUBLIC_TRAIL_END` significa **limite de evidência**, não indício adverso. Ele não pode elevar score de risco, confiança acusatória ou prioridade reputacional apenas porque o dado faltante é sigiloso.

### 6.9 Submeter a revisão humana

Antes do dossiê, revisores humanos devem confirmar:

- pertinência e interesse público;
- legalidade das fontes e métodos;
- integridade da custódia;
- separação entre fatos, relações e hipóteses;
- cálculos, estornos e duplicidades;
- presença de contraprovas e explicações alternativas;
- minimização de dados pessoais;
- necessidade e proporcionalidade do encaminhamento;
- autoridade destinatária compatível;
- redação não acusatória e ausência de conclusão automática.

Estados mínimos: `DRAFT`, `HUMAN_REVIEW`, `NEEDS_MORE_INFORMATION`, `APPROVED_FOR_EXPORT`, `REJECTED` e `EXPORTED`. Aprovação para exportação não equivale a autorização para protocolo, publicação ou envio.

### 6.10 Gerar o `Referral Dossier`

Somente uma investigação revisada pode produzir o dossiê. O renderer futuro deve ser determinístico, sanitizado e vinculado por hash à revisão e aos registros de origem.

## 7. Contrato conceitual do `Referral Dossier`

O dossiê deve conter, no mínimo:

1. identificador, versão, instante de geração e escopo;
2. pergunta investigativa e interesse público;
3. resumo executivo neutro;
4. cronologia dos eventos documentados;
5. fatos documentais confirmados, cada um com proveniência;
6. tabela de fontes, localizadores, identificadores, datas de acesso e hashes;
7. entidades e relações, com força, estado e contraprovas;
8. cálculos reproduzíveis, critérios de inclusão e prevenção de dupla contagem;
9. inconsistências observadas sem conclusão jurídica automática;
10. alegações e hipóteses claramente rotuladas;
11. explicações alternativas e material refutatório;
12. registros `PUBLIC_TRAIL_END` e impacto das lacunas;
13. classe de dado protegido estritamente necessária para cada questão aberta;
14. finalidade probatória esperada: confirmar, refutar ou desambiguar;
15. classe de autoridade ou órgão potencialmente competente e justificativa de competência em termos gerais;
16. riscos, limitações e cobertura;
17. decisões de revisão humana, responsáveis e timestamps;
18. manifesto de exportação e digest do pacote sanitizado.

O dossiê não deve conter:

- credenciais, tokens, segredos ou material de autenticação;
- dado protegido obtido sem base válida;
- endereços residenciais, contatos, documentos pessoais ou dados íntimos sem necessidade demonstrada;
- bytes brutos que pertençam ao cofre privado;
- inferência de culpa decorrente de ausência, sigilo ou relação meramente candidata;
- instruções para contornar controle de acesso;
- pedido automático de medida coercitiva.

## 8. Encaminhamento humano e roteamento institucional

O ARCA pode sugerir classes de destinatário, como órgão de controle, Ministério Público, tribunal de contas, autoridade eleitoral, corregedoria, controlador interno ou custodiante administrativo. A competência concreta depende do assunto, ente federativo, território e norma vigente e deve ser confirmada por pessoa qualificada antes do envio.

O fluxo deve separar quatro decisões:

1. `APPROVED_FOR_EXPORT`: o pacote técnico pode ser renderizado;
2. `APPROVED_FOR_REFERRAL`: um humano aprovou encaminhamento a destinatário definido;
3. `SUBMITTED`: um humano ou integração especificamente autorizada confirmou o protocolo;
4. `RECEIPT_RECORDED`: comprovante foi anexado à trilha de custódia.

Nenhuma transição pode ser inferida da anterior. A V0.1 não autoriza integração de protocolo.

## 9. Proibições operacionais absolutas

O ARCA deve rejeitar e registrar tentativa de:

- invasão de dispositivo, conta, servidor ou rede;
- exploração de vulnerabilidade para acessar material não público;
- phishing, pretexting, impersonação ou outra engenharia social;
- obtenção, adivinhação, reutilização ou abuso de credenciais;
- interceptação de comunicação, tráfego, chamadas ou localização;
- compra, troca, solicitação ou operacionalização de vazamentos privados;
- indução de servidor, prestador ou terceiro a violar dever de sigilo;
- uso de consentimento enganoso, genérico ou obtido sob coerção;
- tentativa técnica ou processual de superar sigilo fora das vias legais;
- publicação de dado protegido ou identificador pessoal desnecessário;
- retaliação, exposição ou classificação automática de denunciante.

Ao detectar uma dessas condições, o worker deve parar sem inspecionar o conteúdo, preservar apenas metadados mínimos do incidente e solicitar revisão de segurança.

## 10. Modelo de saída e linguagem

Os textos gerados devem usar formulações compatíveis com o estado probatório:

- “a fonte registra” para conteúdo atribuído;
- “o ARCA observou uma relação candidata” para correlação ainda não confirmada;
- “os documentos permitem reconciliar” para vínculo documental reproduzível;
- “não foi observado no escopo consultado” para resultado negativo;
- “a trilha pública terminou” para `PUBLIC_TRAIL_END`;
- “a autoridade X concluiu” somente com decisão oficial corretamente citada.

Termos como “roubo”, “desvio”, “fraude”, “corrupção”, “laranja” ou “culpado” não podem ser afirmação do ARCA sem achado oficial ou fato adjudicado pertinente. Mesmo nesses casos, autoria, status, recurso e contexto devem ser preservados.

## 11. Implementação futura no M5-R

A implementação deve ser incremental:

1. schema versionado do registro de investigação e do dossiê;
2. validador fail-closed de completude, estados epistêmicos e `PUBLIC_TRAIL_END`;
3. reconciliador de categorias financeiras, estornos e duplicidades;
4. grafo de relações com suporte, contraprova e hipóteses concorrentes;
5. controle de dados protegidos e minimização;
6. gate obrigatório de revisão humana;
7. renderer determinístico do dossiê;
8. manifesto criptográfico e exportação pública higienizada;
9. testes exclusivamente sintéticos, incluindo falsos positivos e trilhas incompletas;
10. prova controlada sem protocolo nem publicação automática.

A implementação depende de M5 demonstrar aquisição correlacionada, custódia, dois agentes independentes, verificação adversarial e revisão humana. M5-R não é atalho para acesso live nem substitui os gates de M4 e M5.

## 12. Critérios de aceite da futura implementação

M5-R só estará implementado quando testes demonstrarem que:

1. fatos, alegações, hipóteses, relações e achados oficiais não se misturam;
2. remuneração pessoal não se mistura a gabinete, equipe, campanha, emenda ou contratação;
3. estorno, duplicidade e período parcial não inflam totais;
4. `PUBLIC_TRAIL_END` não produz inferência adversa;
5. dado protegido é recusado e substituído por descrição mínima da lacuna;
6. hipótese concorrente e contraprova permanecem no pacote;
7. nenhuma exportação ocorre sem revisão humana válida e vinculada;
8. pacote público não contém segredo, bytes privados ou identificador desnecessário;
9. renderer reproduz o mesmo digest para a mesma entrada canônica;
10. nenhum encaminhamento, protocolo, acusação ou pedido coercitivo ocorre automaticamente.

## 13. Condições de parada

Interromper aquisição, análise, exportação ou encaminhamento quando houver:

- origem ou autoridade de acesso incerta;
- necessidade de contornar autenticação ou sigilo;
- custódia inválida ou proveniência insuficiente;
- dado pessoal sem pertinência demonstrada;
- contradição material não representada;
- cálculo não reproduzível;
- destinatário ou competência não confirmados;
- ausência de revisão humana válida;
- tentativa de converter o dossiê em veredito ou publicação automática.

## 14. Relação com outros controles do ARCA

Esta especificação deve ser lida com:

- `ARCA_INVESTIGATIVE_BOUNDARY_V0_1.md`;
- `ARCA_PUBLIC_DATA_ACQUISITION_V0_1.md`;
- `ARCA_ACQUISITION_CUSTODY_SPEC_v0.3.0.md`;
- `ARCA_EVIDENCE_TAXONOMY_V0_1.md`;
- `ARCA_INVESTIGATION_RECORD_V0_1.md`;
- `ARCA_PRIVACY_CLASSIFICATION_PUBLICATION_GATE_V1.md`;
- `ARCA_PUBLICATION_BOUNDARY_V1.md`;
- `ARCA_ROADMAP_DETALHADO_CURRENT.md`.

Em caso de conflito, aplica-se a regra mais restritiva até revisão explícita e versionada.

## 15. Versionamento

Mudança de classe de fonte, método de acesso, dado protegido, autoridade de encaminhamento ou automação exige nova versão revisada. Workers não podem ampliar por conta própria o escopo deste método.
