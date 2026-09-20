# ARCA Agent Connection Tutorials v1

**Status:** backend catalog only; no frontend/UI in this milestone.  
**Tutorial source:** `packages/agent/src/connection-tutorials.ts`  
**Combined catalog:** `packages/agent/src/connection-catalog.ts`  
**Formats:** `arca-agent-connection-tutorial-v1` and `arca-agent-connection-catalog-v1`

## Purpose

The ARCA backend carries structured onboarding/tutorial metadata for every supported connection mode. A future frontend should render the combined connection catalog instead of hard-coding provider instructions.

The combined catalog includes the security notice returned by `getCredentialSecurityNotice()`. This notice is part of the connection experience, not optional marketing copy.

The catalog does **not** store API keys, tokens, passwords or OAuth secrets. Cloud credentials must stay in the encrypted host credential vault and the Agent Registry receives only a `credentialRef`.

## Mandatory security notice for future UI

Any future screen that accepts, links or configures credentials must display the backend security notice near the connection controls. At minimum, the user must be told that:

1. persisted credentials are encrypted with authenticated encryption;
2. the Registry, ARCA Agent, Core, jobs and reports do not receive the stored secret value;
3. authenticated calls go through the Credential Broker;
4. use/rotation/deletion create a secret-free audit trail;
5. the user can verify hashes and the audit chain;
6. no honest system can promise that a credential never exists in process memory while it is actually being used to authenticate a request.

The frontend must not rewrite these claims into stronger guarantees than the backend can prove.

## Backend compatibility labels

- `direct`: the current Agent Gateway can use this connection type directly.
- `provider-adapter-required`: setup instructions are ready, but the provider-specific protocol adapter still has to be implemented.
- `auth-flow-adapter-required`: the Gateway knows the authentication class, but the provider-specific login/token-refresh flow still needs an adapter.

This prevents a future UI from presenting a tutorial as a working direct integration before the backend adapter exists.

## Cloud API providers

### OpenAI / GPT API

Create/manage API key: https://platform.openai.com/api-keys  
Authentication docs: https://platform.openai.com/docs/api-reference/authentication

Basic flow:
1. Sign in to the OpenAI Platform and select the correct project.
2. Create a new API key and copy it when shown.
3. Store it in the ARCA encrypted credential vault.
4. Register only a `credentialRef`.
5. Use the OpenAI provider adapter after that adapter is enabled.

Do not expose the key in frontend code, jobs, logs or Git commits. ChatGPT subscription billing and API billing are separate products.

### Anthropic / Claude API

Create/manage API key: https://platform.claude.com/settings/keys  
Developer docs: https://docs.anthropic.com/en/api/getting-started

Basic flow:
1. Sign in to Claude Platform.
2. Create an API key in the intended workspace/project.
3. Put the key in the encrypted host credential vault.
4. Keep only its `credentialRef` in ARCA configuration.
5. Use the Anthropic adapter once available.

### Google Gemini API

Create/manage API key: https://aistudio.google.com/app/apikey  
API key docs: https://ai.google.dev/gemini-api/docs/api-key

Basic flow:
1. Sign in to Google AI Studio.
2. Create a key for the intended project and follow Google's current restrictions guidance.
3. Store it in the encrypted host credential vault.
4. Register only the `credentialRef` in ARCA.
5. Use the Gemini adapter once available.

Provider instructions can change; the official documentation link remains the source of truth when the tutorial is rendered.

### OpenRouter

Create/manage API key: https://openrouter.ai/settings/keys  
Quickstart: https://openrouter.ai/docs/quickstart

Basic flow:
1. Sign in to OpenRouter and open workspace keys.
2. Create a key and optionally configure spending limits.
3. Save the key in the encrypted host credential vault.
4. Register only a `credentialRef`.
5. Use the OpenRouter adapter once available.

### Ollama Cloud

Create/manage API key: https://ollama.com/settings/keys  
Authentication docs: https://docs.ollama.com/api/authentication

Basic flow:
1. Sign in to ollama.com.
2. Create an API key for programmatic cloud access.
3. Store it in the encrypted host credential vault.
4. Register the `credentialRef` only.
5. Use the Ollama cloud adapter once available.

## Local model servers

### Ollama local

API docs: https://docs.ollama.com/api/introduction  
Default API: `http://localhost:11434/api`

Basic flow:
1. Install Ollama on the machine that will run the model.
2. Download the desired model and start Ollama.
3. Keep the API bound to localhost whenever possible.
4. Authorize loopback access on the ARCA host.
5. Use the Ollama local adapter once available.

Local Ollama does not require API authentication by default. Do not expose its local port publicly without an appropriate security layer.

### LM Studio local

Quickstart: https://lmstudio.ai/docs/developer/rest/quickstart  
Typical local server: `http://localhost:1234`

Basic flow:
1. Install LM Studio and download/load a model.
2. Start the local API server from the Developer area.
3. Keep the server on localhost when possible.
4. If exposing it to a LAN, enable authentication and restrict access.
5. Use the LM Studio adapter once available.

## Custom ARCA agent — AAP

**Backend support:** direct today.

No third-party API key is required unless the custom service chooses to require one.

The custom agent must expose:

- `GET /arca/agent` returning `arca-agent-descriptor-v1`;
- `POST /arca/jobs` accepting `arca-agent-task-v1` and returning `arca-agent-result-v1`;
- `humanReviewRequired: true` in returned results.

Supported authentication classes are none, Bearer token, API key header and OAuth2 bearer token by `credentialRef`. Authenticated connections require the Credential Broker; the Gateway does not accept raw credential resolution.

Remote endpoints must use HTTPS. Plain HTTP is accepted only for an explicitly authorized loopback endpoint. Redirects are refused. External agents do not receive direct Core mutation authority or an unrestricted shell.

## OAuth 2.0

OAuth is represented in the backend contract, but each provider still needs its own authorization/callback/refresh adapter.

General flow:
1. Register the ARCA host/application with the provider.
2. Configure the provider-required callback URL.
3. Send the user to the provider's own authorization page.
4. Never collect the user's provider password inside ARCA.
5. Store access/refresh tokens in the encrypted host credential vault and expose only a `credentialRef` to the Registry.
6. Test token refresh and revocation behavior before enabling real tasks.

## Frontend contract for later

A future connection screen should consume `getAgentConnectionCatalog()` and render, at minimum:

- security notice and audit explanation;
- provider/mode name;
- whether an API key is required;
- official key-creation link when applicable;
- official documentation link;
- short numbered setup steps;
- security notes;
- `backendSupport` so unavailable adapters cannot be presented as already functional;
- a way to inspect credential metadata and audit hashes without ever revealing the secret.

The backend catalog is the source of truth; provider instructions and security guarantees should not be duplicated as hard-coded frontend text.
