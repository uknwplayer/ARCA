import test from "node:test";
import assert from "node:assert/strict";
import {
  createA2aPublicMessageClient,
  fetchA2aPublicAgentCard,
  inspectA2aPublicInteractionProfile
} from "../packages/agent/src/a2a-public-message.ts";

const SOURCE="https://registry.example";
const ENDPOINT="https://agent.example/rpc";

function card(overrides={}){
  return {
    name:"Public Route Agent",
    description:"Synthetic public A2A agent",
    supportedInterfaces:[{
      url:ENDPOINT,
      protocolBinding:"JSONRPC",
      protocolVersion:"1.0"
    }],
    securitySchemes:{},
    securityRequirements:[],
    skills:[{
      id:"route-assessment",
      name:"Route assessment",
      tags:["route"]
    }],
    ...overrides
  };
}

function response(result,{id="req-1",statusCode=200,location=null,remoteAddress="93.184.216.34"}={}){
  return {
    statusCode,
    location,
    contentType:"application/json",
    tlsAuthorized:true,
    remoteAddress,
    body:JSON.stringify({jsonrpc:"2.0",id,result})
  };
}

const publicDns=async()=>[{address:"93.184.216.34",family:4}];


test("public Agent Card fetch pins public DNS and does not grant trust",async()=>{
  const seen=[];
  const loaded=await fetchA2aPublicAgentCard({
    origin:SOURCE,
    networkEnabled:true,
    lookupImpl:async()=>[{address:"93.184.216.34",family:4}],
    getImpl:async input=>{
      seen.push(input);
      return {
        statusCode:200,
        location:null,
        contentType:"application/json",
        tlsAuthorized:true,
        remoteAddress:"93.184.216.34",
        body:JSON.stringify(card({
          supportedInterfaces:[{
            url:SOURCE+"/rpc",
            protocolBinding:"JSONRPC",
            protocolVersion:"1.0"
          }]
        }))
      };
    }
  });
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,SOURCE+"/.well-known/agent-card.json");
  assert.match(loaded.cardHash,/^[a-f0-9]{64}$/);
  assert.equal(loaded.authenticationSent,false);
  assert.equal(loaded.trustGranted,false);
  assert.equal(loaded.admissionGranted,false);
});

test("public Agent Card fetch refuses private DNS before GET",async()=>{
  let called=false;
  await assert.rejects(
    ()=>fetchA2aPublicAgentCard({
      origin:SOURCE,
      networkEnabled:true,
      lookupImpl:async()=>[{address:"10.0.0.1",family:4}],
      getImpl:async()=>{called=true;return {}}
    }),
    /forbidden IPv4/
  );
  assert.equal(called,false);
});

test("public v1 JSON-RPC card yields SendMessage profile without granting trust",()=>{
  const profile=inspectA2aPublicInteractionProfile(card(),{
    sourceOrigin:SOURCE,
    allowedAgentOrigins:["https://agent.example"]
  });
  assert.equal(profile.protocolVersion,"1.0");
  assert.equal(profile.method,"SendMessage");
  assert.equal(profile.publicUnauthenticated,true);
  assert.equal(profile.trustGranted,false);
  assert.equal(profile.admissionGranted,false);
  assert.equal(profile.capabilityVerificationGranted,false);
});

test("legacy v0.3 JSON-RPC card yields message/send",()=>{
  const profile=inspectA2aPublicInteractionProfile(card({
    supportedInterfaces:[{
      url:ENDPOINT,
      protocolBinding:"JSON-RPC",
      protocolVersion:"0.3.0"
    }]
  }),{
    sourceOrigin:SOURCE,
    allowedAgentOrigins:["https://agent.example"]
  });
  assert.equal(profile.protocolVersion,"0.3");
  assert.equal(profile.method,"message/send");
});

test("card requiring agent authentication is rejected",()=>{
  assert.throws(
    ()=>inspectA2aPublicInteractionProfile(card({
      securitySchemes:{bearer:{type:"http",scheme:"bearer"}},
      securityRequirements:[{schemes:{bearer:[]}}]
    }),{
      sourceOrigin:SOURCE,
      allowedAgentOrigins:["https://agent.example"]
    }),
    error=>error?.code==="ARCA_A2A_PUBLIC_AUTH_REQUIRED"
  );
});

test("card with authenticated skill is conservatively rejected",()=>{
  assert.throws(
    ()=>inspectA2aPublicInteractionProfile(card({
      skills:[{
        id:"route-assessment",
        name:"Route assessment",
        securityRequirements:[{schemes:{bearer:[]}}]
      }]
    }),{
      sourceOrigin:SOURCE,
      allowedAgentOrigins:["https://agent.example"]
    }),
    error=>error?.code==="ARCA_A2A_PUBLIC_SKILL_AUTH_REQUIRED"
  );
});

test("unapproved cross-origin endpoint is rejected",()=>{
  assert.throws(
    ()=>inspectA2aPublicInteractionProfile(card(),{sourceOrigin:SOURCE}),
    error=>error?.code==="ARCA_A2A_PUBLIC_ORIGIN_NOT_AUTHORIZED"
  );
});

test("v1 send is text-only, unauthenticated and preserves JSON-RPC correlation",async()=>{
  const seen=[];
  const profile=inspectA2aPublicInteractionProfile(card(),{
    sourceOrigin:SOURCE,
    allowedAgentOrigins:["https://agent.example"]
  });
  const client=createA2aPublicMessageClient({
    profile,
    networkEnabled:true,
    lookupImpl:publicDns,
    postImpl:async input=>{
      seen.push(input);
      return response({
        message:{
          messageId:"server-message-1",
          role:"ROLE_AGENT",
          parts:[{text:"Synthetic public capability statement"}]
        }
      });
    }
  });
  const result=await client.sendText(
    "Describe your public capabilities and uncertainty. Do not perform external side effects.",
    {requestId:"req-1",messageId:"msg-1"}
  );

  assert.equal(seen.length,1);
  const request=JSON.parse(seen[0].body);
  assert.equal(request.method,"SendMessage");
  assert.equal(request.params.message.role,"ROLE_USER");
  assert.deepEqual(request.params.message.parts,[{text:"Describe your public capabilities and uncertainty. Do not perform external side effects."}]);
  assert.equal(request.params.configuration.returnImmediately,false);
  assert.equal(request.params.configuration.historyLength,5);
  assert.equal(seen[0].headers.Authorization,undefined);
  assert.equal(seen[0].headers["A2A-Version"],"1.0");

  assert.equal(result.externalTestimonyOnly,true);
  assert.equal(result.trustGranted,false);
  assert.equal(result.admissionGranted,false);
  assert.equal(result.capabilityVerificationGranted,false);
  assert.equal(result.roleConformanceGranted,false);
  assert.equal(result.runtimeBindingGranted,false);
  assert.match(result.responseHash,/^[a-f0-9]{64}$/);
});

test("v0.3 send uses message/send and legacy text part discriminator",async()=>{
  const seen=[];
  const profile=inspectA2aPublicInteractionProfile(card({
    supportedInterfaces:[{
      url:ENDPOINT,
      protocolBinding:"JSONRPC",
      protocolVersion:"0.3"
    }]
  }),{
    sourceOrigin:SOURCE,
    allowedAgentOrigins:["https://agent.example"]
  });
  const client=createA2aPublicMessageClient({
    profile,
    networkEnabled:true,
    lookupImpl:publicDns,
    postImpl:async input=>{
      seen.push(input);
      return response({kind:"message",messageId:"server-legacy",role:"agent",parts:[{kind:"text",text:"ok"}]});
    }
  });
  await client.sendText("public capability probe",{requestId:"req-1",messageId:"msg-1"});
  const request=JSON.parse(seen[0].body);
  assert.equal(request.method,"message/send");
  assert.equal(request.params.message.role,"user");
  assert.deepEqual(request.params.message.parts,[{kind:"text",text:"public capability probe"}]);
  assert.equal(seen[0].headers["A2A-Version"],"0.3");
});

test("JSON-RPC response id mismatch is rejected",async()=>{
  const profile=inspectA2aPublicInteractionProfile(card(),{
    sourceOrigin:SOURCE,
    allowedAgentOrigins:["https://agent.example"]
  });
  const client=createA2aPublicMessageClient({
    profile,networkEnabled:true,lookupImpl:publicDns,
    postImpl:async()=>response({message:{}},{id:"other"})
  });
  await assert.rejects(
    ()=>client.sendText("probe",{requestId:"req-1",messageId:"msg-1"}),
    error=>error?.code==="ARCA_A2A_PUBLIC_RESPONSE_ID_MISMATCH"
  );
});

test("JSON-RPC error is surfaced without granting trust",async()=>{
  const profile=inspectA2aPublicInteractionProfile(card(),{
    sourceOrigin:SOURCE,
    allowedAgentOrigins:["https://agent.example"]
  });
  const client=createA2aPublicMessageClient({
    profile,networkEnabled:true,lookupImpl:publicDns,
    postImpl:async()=>({
      ...response({},{}),
      body:JSON.stringify({jsonrpc:"2.0",id:"req-1",error:{code:-32601,message:"Method not found"}})
    })
  });
  await assert.rejects(
    ()=>client.sendText("probe",{requestId:"req-1",messageId:"msg-1"}),
    error=>error?.code==="ARCA_A2A_PUBLIC_JSONRPC_ERROR"
  );
});

test("redirect is refused and never followed",async()=>{
  const profile=inspectA2aPublicInteractionProfile(card(),{
    sourceOrigin:SOURCE,
    allowedAgentOrigins:["https://agent.example"]
  });
  const client=createA2aPublicMessageClient({
    profile,networkEnabled:true,lookupImpl:publicDns,
    postImpl:async()=>response({},{
      statusCode:302,
      location:"https://other.example/rpc"
    })
  });
  await assert.rejects(
    ()=>client.sendText("probe",{requestId:"req-1",messageId:"msg-1"}),
    error=>error?.code==="ARCA_A2A_PUBLIC_REDIRECT_REFUSED"
  );
});

test("private DNS resolution is rejected before POST",async()=>{
  let posted=false;
  const profile=inspectA2aPublicInteractionProfile(card(),{
    sourceOrigin:SOURCE,
    allowedAgentOrigins:["https://agent.example"]
  });
  const client=createA2aPublicMessageClient({
    profile,
    networkEnabled:true,
    lookupImpl:async()=>[{address:"127.0.0.1",family:4}],
    postImpl:async()=>{posted=true;return response({})}
  });
  await assert.rejects(()=>client.sendText("probe",{requestId:"req-1",messageId:"msg-1"}),/forbidden IPv4/);
  assert.equal(posted,false);
});

test("network is disabled by default",async()=>{
  const profile=inspectA2aPublicInteractionProfile(card(),{
    sourceOrigin:SOURCE,
    allowedAgentOrigins:["https://agent.example"]
  });
  const client=createA2aPublicMessageClient({profile});
  await assert.rejects(
    ()=>client.sendText("probe",{requestId:"req-1",messageId:"msg-1"}),
    error=>error?.code==="ARCA_A2A_PUBLIC_NETWORK_DISABLED"
  );
});
