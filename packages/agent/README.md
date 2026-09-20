# ARCA Agent Bundle 0.2.0

O Agent Bundle mantém o ARCA Agent sob autoridade de proposta: nenhum modelo altera diretamente o estado canônico. O pacote também contém o Agent Gateway v1, uma camada backend para conectar inteligências externas opcionais sem tornar nenhum fornecedor dependência do Core.

Arquivos principais:

- `ARCA_AGENT_SYSTEM_PROMPT_v0.2.0.md`: instrução de sistema independente de fornecedor;
- `arca-agent-proposal-v1.schema.json`: contrato de propostas;
- `src/proposals.ts`: armazenamento, validação, revisão e aplicação das propostas;
- `src/gateway.ts`: Registry, roteamento por capability, handshake AAP e transporte controlado de agentes externos;
- `src/connection-tutorials.ts`: catálogo backend de modos de conexão, links oficiais e tutoriais curtos que um frontend futuro poderá renderizar.

## Modelo de agente

O sistema trabalha com um único coordenador principal (`arca-primary`). Outros modelos/agentes são recursos opcionais registrados pelo usuário. Um agente externo não recebe shell, Worker, ferramenta ou autoridade do Core automaticamente.

Conexões externas podem usar `none`, bearer, API key ou OAuth2. O descriptor guarda somente um `credentialRef`; a credencial real é resolvida pelo host no limite de transporte e não aparece na listagem pública do Registry.

Rede externa permanece bloqueada por padrão. Endpoints remotos exigem origem explicitamente allowlisted; loopback local exige autorização própria. O Gateway rejeita redirects e HTTP sem TLS fora de loopback.

## Tutoriais de conexão

O backend expõe um catálogo estruturado para OpenAI/GPT, Anthropic/Claude, Google Gemini, OpenRouter, Ollama Cloud, Ollama local, LM Studio, agente próprio compatível com AAP e OAuth2 genérico. Cada item informa se exige chave, links oficiais, passos básicos, observações de segurança e o estado real de suporte do backend.

Integrações de provedores comerciais ficam marcadas como `provider-adapter-required` enquanto o adaptador direto ainda não existir. O modo `custom-aap-agent` é marcado como `direct`, pois o Agent Gateway v1 já executa diretamente o protocolo AAP. Isso evita que uma interface futura prometa conexão imediata onde ainda existe trabalho de backend.

## Garantias

- uma proposta nunca escreve diretamente no event log;
- `requiresHumanReview` é sempre verdadeiro;
- a proposta é vinculada ao `eventHead` observado;
- o conteúdo imutável recebe SHA-256 canônico;
- a aplicação exige confirmação textual e revalida o estado;
- somente uma operação é aplicada, por um evento canônico do Core;
- o evento registra o revisor humano, o ID e o hash da proposta;
- proposta alterada, obsoleta, rejeitada ou já aplicada falha fechada;
- resultado do Agent Gateway declara `coreMutationPerformed: false`;
- agentes externos só participam do roteamento quando `allowExternal: true` é explícito.

O formato não concede selo, não executa pesquisa por si só e não transforma linguagem de modelo em evidência. Consulte `docs/ARCA_AGENT_GATEWAY_V1.md` para o contrato de conexão e `docs/ARCA_AGENT_CONNECTION_TUTORIALS_v1.md` para o catálogo de onboarding.
