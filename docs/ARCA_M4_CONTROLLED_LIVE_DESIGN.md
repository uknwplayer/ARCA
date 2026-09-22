# ARCA — Desenho M4: aquisição live isolada por fonte

Estado: **DESENHO APROVADO; PREPARAÇÃO OFFLINE EM ANDAMENTO; SEM CÓDIGO DE TRANSPORTE LIVE NOVO E SEM EXECUÇÃO DE REDE**. Base canônica: `861014be4d10810215298a89c278f884a095bfe4` (M3 integrado). Data: 2026-09-22.

## Intenção e sucesso

Provar uma aquisição real limitada e auditável, primeiro por fonte separada, mantendo o núcleo autônomo orientado a eventos. O sucesso é um recibo sanitizado e uma cópia criptografada em cofre privado durável de uma única consulta explicitamente autorizada. Captura não gera hipótese adversa, caso investigativo, correlação, publicação ou cobertura nacional declarada.

## Decisão de desenho

1. **PNCP primeiro:** reutilizar os controles de `.github/workflows/arca-pncp-controlled-live-probe.yml` e `scripts/arca-pncp-national-live-probe.mjs`. O probe durável AP 002 já provou a aquisição PNCP e não precisa ser repetido por rotina. Se um novo probe M4 for necessário para validar nova revisão, escolher UF, data e modalidade para *um único ciclo*, registrar estes parâmetros antes da execução e confirmar a autorização específica. Nenhuma UF ou município é padrão.
2. **Portal em outro ciclo:** preferir consulta pontual pela API oficial, com *um código de documento real previamente escolhido*, fase de pagamento e página 1, em vez de baixar primeiro o arquivo completo de despesas. A API exige token enviado por canal privado; o token não vai para URL, log, artefato ou relatório. A consulta de empenhos impactados deve ser precedida pela confirmação do contrato oficial dos parâmetros e pela validação do documento escolhido. Nenhum código de documento é embutido no produto.
3. O download oficial `Despesas_Pagamento_EmpenhosImpactados.csv` confirma que há dados de vínculo pagamento→empenhos; seu layout integral ainda não foi verificado no ARCA. **Não** interpretar resposta da API como se fosse linha desse CSV nem adaptar o parser sintético M1 diretamente a registros reais.
4. No primeiro ciclo de cada fonte, capturar bytes antes de interpretar; preservar resposta HTTP, metadados de escopo, URL sanitizada, data de aquisição, digest e lacunas em custódia criptografada. Só após persistência privada durável emitir recibo. Parsing e promoção para envelopes reais são gate posterior, com schema efetivamente observado e testes próprios.

## Contrato do probe M4

| Parâmetro | Limite inicial proposto | Falha segura |
|---|---|---|
| Origem | PNCP ou Portal, nunca ambas no mesmo run | rejeitar origem extra |
| PNCP | 1 UF explícita, 1 data, 1 modalidade, 1 página, até 10 registros | abortar sobrelimite |
| Portal | 1 endpoint documentado, 1 código explícito, fase de pagamento validada, página 1 | abortar filtro ambíguo |
| Transporte | somente GET, 1 tentativa, timeout 30 s, teto de resposta fixo antes de decodificar | registrar `SOURCE_UNAVAILABLE` ou parada conforme estágio; não repetir automaticamente |
| Credenciais | segredo privado; no Portal, token da API; cofre privado pré-validado | zero GET se faltar/for inválido |
| Custódia | criptografar e persistir antes de marcar sucesso; limpar staging | nunca declarar sucesso com persistência pendente |
| Saída pública | digest, escopo, contagens limitadas, status de custódia e lacunas | nenhuma resposta bruta ou identificador pessoal |
| Análise | classificador, ingresso, correlação e publicação desabilitados | falhar fechado ao detectar invocação |

O teto de bytes do Portal e o código de documento são *campos obrigatórios da implementação/pré-registro*, ainda sem valor aprovado. Não tratar um teto do PNCP como automaticamente suficiente para a API do Portal. A escolha de retorno vazio, 401/403, 429, 5xx, timeout ou formato divergente deve distinguir indisponibilidade, autorização e erro de contrato; jamais gerar suspeita ou concluir ausência de pagamento.

## Gates verificáveis antes de qualquer GET

1. PR do código M4 com CI no Node 22.18 e testes de transporte falso: nenhum GET sem confirmação exata; um GET no caminho positivo; zero retry; host/rota/query em allowlist; limite de bytes; resposta inesperada recusada; sem segredo em saída; indisponibilidade como lacuna.
2. Cofre privado durável acessível e validado *antes* da consulta; cifragem, recibo de persistência e limpeza após falha testados. Não assumir que um secret configurado no passado permanece presente ou válido.
3. Escopo concreto em manifesto de execução: fonte, endpoint, código do documento ou UF/data/modalidade, revisão canônica, data/hora e budgets. Comparar manifesto com inputs do workflow e URL real; divergência aborta antes do GET.
4. Confirmação explícita específica para o manifesto, após o código e os limites estarem disponíveis para revisão. Uma autorização geral para colaborar no GitHub não libera por si só o acesso live do M4.
5. Primeiro PNCP e depois Portal, em runs separados; cada run recebe checkpoint com resultado inclusive vazio/falha. Não correlacionar fontes nessa fase.

## Fronteiras de dados

O PNCP tem arquitetura nacional por 27 UFs; selecionar uma UF para um probe não a torna prioridade permanente. O Portal da Transparência cobre execução federal; não inferir que seus pagamentos representam despesas próprias de todos os estados e municípios nem atribuir UF da despesa sem documento verificável. A futura expansão municipal/estadual usa conectores oficiais próprios. Nomes, CPFs e documentos potencialmente presentes na resposta ficam em custódia privada e não entram em logs públicos.

## Estratégias consideradas

| Estratégia | Benefício | Limite | Decisão |
|---|---|---|---|
| Repetir só PNCP | transporte e custódia já provados | não avança a fonte financeira | usar apenas se validar revisão nova |
| Baixar CSV mensal completo | formato oficial para relações | volume alto, filtros incertos, layout real desconhecido | adiar até parser e orçamento próprios |
| API pontual por documento | consulta pequena e auditável | exige token privado e código concreto; contrato precisa ser conferido | preferida para primeiro Portal live |

## Próxima implementação após revisão do desenho

1. Formalizar manifesto e modelo de resultado para uma fonte, com código do documento e teto de bytes obrigatórios onde aplicável.
2. Implementar transporte Portal allowlisted com testes de fake fetch e orçamento antes de receber corpo integral; sem reusar o normalizador de fixture como parser real.
3. Integrar captura bruta→cifra→persistência privada→recibo sanitizado ao backend existente; adicionar workflow manual com inputs/secret preflight e publicação desligada.
4. Executar gates offline completos e abrir PR; somente após CI, escolher um escopo real limitado e pedir autorização explícita para o primeiro GET.
5. Registrar o resultado em checkpoint e só então planejar M5, que exigirá vínculo documental real e revisão humana.

Fontes oficiais consultadas em 2026-09-22:

- https://portaldatransparencia.gov.br/api-de-dados (consulta pontual, cadastro e token);
- https://portaldatransparencia.gov.br/download-de-dados/despesas (arquivos de pagamento e empenhos impactados);
- https://api.portaldatransparencia.gov.br/swagger-ui/index.html (contratos da API a conferir antes da implementação);
- `docs/ARCA_PNCP_DURABLE_LIVE_PROOF_002.md` (prova anterior do PNCP, restrita ao próprio escopo).
