# Provider HTTP Adapter v0.1

Boundary HTTP para adapters reais do MBDP. O núcleo continua provider-agnostic.

OpenAI, Anthropic, Gemini e xAI/Grok possuem descritores de endpoint. Meta permanece com endpoint explicitamente configurável nesta versão: o ARCA não inventa nem fixa uma API Meta sem validar o produto/serviço de inferência que será usado.

O invoker exige HTTPS, mantém a chave somente no header da chamada e delega encode/decode ao adapter específico. Respostas devem voltar ao Provider Reasoner e continuar limitadas a `audit_*` ou mensagem final.

Nenhuma chamada externa é executada pelos testes; `fetch` é simulado.
