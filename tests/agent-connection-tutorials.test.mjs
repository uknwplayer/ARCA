import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCA_AGENT_CONNECTION_TUTORIAL_FORMAT,
  getAgentConnectionTutorial,
  listAgentConnectionModes,
  listAgentConnectionTutorials
} from "../packages/agent/src/connection-tutorials.ts";

const expectedIds=[
  "anthropic-claude-api",
  "custom-aap-agent",
  "google-gemini-api",
  "lm-studio-local",
  "oauth2-provider",
  "ollama-cloud-api",
  "ollama-local",
  "openai-api",
  "openrouter-api"
];

test("tutorial catalog exposes provider and connection modes without frontend coupling",()=>{
  const tutorials=listAgentConnectionTutorials();
  assert.deepEqual(tutorials.map(item=>item.id).sort(),expectedIds);
  assert.deepEqual(listAgentConnectionModes(),[
    {mode:"cloud-api",count:5},
    {mode:"local-api",count:2},
    {mode:"custom-aap",count:1},
    {mode:"oauth2",count:1}
  ]);
  assert.ok(tutorials.every(item=>item.format===ARCA_AGENT_CONNECTION_TUTORIAL_FORMAT));
  assert.ok(tutorials.every(item=>Array.isArray(item.steps)&&item.steps.length>=3));
});

test("cloud API tutorials carry official creation/documentation links and never secrets",()=>{
  const tutorials=listAgentConnectionTutorials({mode:"cloud-api"});
  for(const tutorial of tutorials){
    assert.equal(tutorial.apiKeyRequired,true);
    assert.match(tutorial.keyCreationUrl,/^https:\/\//);
    assert.match(tutorial.docsUrl,/^https:\/\//);
    assert.equal(tutorial.backendSupport,"provider-adapter-required");
    assert.equal(JSON.stringify(tutorial).includes("sk-"),false);
    assert.equal(JSON.stringify(tutorial).toLowerCase().includes("password\":"),false);
  }
  assert.equal(getAgentConnectionTutorial("openai-api").keyCreationUrl,"https://platform.openai.com/api-keys");
  assert.equal(getAgentConnectionTutorial("anthropic-claude-api").keyCreationUrl,"https://platform.claude.com/settings/keys");
  assert.equal(getAgentConnectionTutorial("google-gemini-api").keyCreationUrl,"https://aistudio.google.com/app/apikey");
});

test("local tutorials describe loopback services without requiring API keys by default",()=>{
  const local=listAgentConnectionTutorials({mode:"local-api"});
  assert.deepEqual(local.map(item=>item.id).sort(),["lm-studio-local","ollama-local"]);
  assert.ok(local.every(item=>item.apiKeyRequired===false));
  assert.ok(local.every(item=>item.serviceUrl.startsWith("http://localhost:")));
});

test("custom AAP tutorial is directly compatible with current gateway and documents all auth modes",()=>{
  const tutorial=getAgentConnectionTutorial("custom-aap-agent");
  assert.equal(tutorial.backendSupport,"direct");
  assert.deepEqual(tutorial.supportedAuthModes,["none","bearer","api-key","oauth2"]);
  assert.ok(tutorial.steps.some(step=>step.includes("GET /arca/agent")));
  assert.ok(tutorial.steps.some(step=>step.includes("POST /arca/jobs")));
});

test("catalog reads return defensive copies and support filters",()=>{
  const first=getAgentConnectionTutorial("openai-api");
  first.steps[0]="mutated";
  const second=getAgentConnectionTutorial("openai-api");
  assert.notEqual(second.steps[0],"mutated");
  assert.equal(listAgentConnectionTutorials({provider:"openai"}).length,1);
  assert.equal(listAgentConnectionTutorials({backendSupport:"direct"})[0].id,"custom-aap-agent");
  assert.throws(()=>listAgentConnectionTutorials({mode:"unknown"}),/modo desconhecido/);
});
