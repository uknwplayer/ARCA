import test from "node:test";import assert from "node:assert/strict";
import {createAuditorToolInterface,describeAuditorTools} from "../../src/machine-bridge/auditor-tool-interface.mjs";
import {projectAuditorToolsForMcp} from "../../src/machine-bridge/auditor-mcp-projection.mjs";
test("all public audit tools are explicitly read-only",()=>{for(const t of describeAuditorTools())assert.equal(t.readOnly,true);assert.equal(describeAuditorTools().length,5);});
test("tool invocation routes through gateway with bound agent identity",async()=>{const calls=[];const gateway={read:async x=>(calls.push(x),{ok:true})};const t=createAuditorToolInterface({gateway,agentId:"agent-1"});await t.audit_get_commit.invoke({repo:"example/arca",sha:"abc"});assert.equal(calls[0].agentId,"agent-1");assert.equal(calls[0].source,"github");assert.match(calls[0].resource,/"kind":"commit"/);});
test("MCP projection advertises non destructive read-only tools",()=>{const tools=createAuditorToolInterface({gateway:{read:async()=>({})},agentId:"a"});for(const t of projectAuditorToolsForMcp(tools)){assert.equal(t.annotations.readOnlyHint,true);assert.equal(t.annotations.destructiveHint,false);}});
