import test from "node:test";
import assert from "node:assert/strict";
import {classifyA2aAccessGate,classifyA2aRuntimeRedirect,createPinnedLookup,probeA2aRuntimeReachability} from "../packages/agent/src/a2a-runtime-reachability.ts";


test("pinned lookup supports Node 22 all:true and legacy single-address callback shapes",async()=>{
  const lookup=createPinnedLookup("93.184.216.34",4);

  const all=await new Promise((resolve,reject)=>{
    lookup("agent.example",{all:true},(error,addresses)=>{
      if(error)reject(error);else resolve(addresses);
    });
  });
  assert.deepEqual(all,[{address:"93.184.216.34",family:4}]);

  const single=await new Promise((resolve,reject)=>{
    lookup("agent.example",{all:false},(error,address,family)=>{
      if(error)reject(error);else resolve({address,family});
    });
  });
  assert.deepEqual(single,{address:"93.184.216.34",family:4});
});

test("runtime probe is network-off by default",async()=>{
  await assert.rejects(
    ()=>probeA2aRuntimeReachability({
      endpoint:"https://agent.example/a2a",
      allowedOrigins:["https://agent.example"]
    }),
    error=>error.code==="ARCA_A2A_RUNTIME_NETWORK_DISABLED"
  );
});

test("runtime probe requires explicit endpoint origin authorization before DNS",async()=>{
  let lookups=0;
  await assert.rejects(
    ()=>probeA2aRuntimeReachability({
      endpoint:"https://agent.example/a2a",
      networkEnabled:true,
      allowedOrigins:["https://other.example"],
      lookupImpl:async()=>{lookups+=1;return[{address:"93.184.216.34",family:4}]}
    }),
    error=>error.code==="ARCA_A2A_RUNTIME_ORIGIN_NOT_AUTHORIZED"
  );
  assert.equal(lookups,0);
});

test("runtime probe refuses private DNS results before contacting runtime",async()=>{
  let heads=0;
  await assert.rejects(
    ()=>probeA2aRuntimeReachability({
      endpoint:"https://agent.example/a2a",
      networkEnabled:true,
      allowedOrigins:["https://agent.example"],
      lookupImpl:async()=>[{address:"10.0.0.7",family:4}],
      headImpl:async()=>{heads+=1;return{statusCode:200}}
    }),
    /forbidden IPv4/
  );
  assert.equal(heads,0);
});

test("runtime probe performs a bodyless HEAD pinned to public DNS and does not verify protocol",async()=>{
  let observed=null;
  const result=await probeA2aRuntimeReachability({
    endpoint:"https://agent.example/a2a",
    networkEnabled:true,
    allowedOrigins:["https://agent.example"],
    lookupImpl:async()=>[
      {address:"2606:2800:220:1:248:1893:25c8:1946",family:6},
      {address:"93.184.216.34",family:4}
    ],
    headImpl:async input=>{
      observed=input;
      return{
        statusCode:405,
        location:null,
        server:"example",
        contentType:"application/json",
        tlsAuthorized:true,
        tlsProtocol:"TLSv1.3",
        remoteAddress:"93.184.216.34",
        remoteFamily:"IPv4"
      };
    }
  });
  assert.equal(observed.url,"https://agent.example/a2a");
  assert.equal(observed.pinnedAddress,"93.184.216.34");
  assert.deepEqual(observed.headers,{
    Accept:"application/json",
    "User-Agent":"ARCA-A2A-Reachability-Probe/0.1",
    Connection:"close"
  });
  assert.equal(result.method,"HEAD");
  assert.equal(result.requestBodyBytes,0);
  assert.equal(result.authenticationSent,false);
  assert.equal(result.jsonRpcSent,false);
  assert.equal(result.taskSent,false);
  assert.equal(result.runtimeContacted,true);
  assert.equal(result.httpResponseReceived,true);
  assert.equal(result.httpStatus,405);
  assert.equal(result.reachabilityState,"reachable-http-response");
  assert.equal(result.protocolVerified,false);
  assert.equal(result.capabilitiesVerified,false);
  assert.equal(result.identityVerified,false);
  assert.equal(result.trustGranted,false);
  assert.equal(result.admissionGranted,false);
  assert.equal(result.dispatchAuthorized,false);
});


test("redirect classifier resolves same-origin relative paths without following",()=>{
  const result=classifyA2aRuntimeRedirect(
    "https://agent.example/a2a",
    "/login"
  );
  assert.equal(result.validUrl,true);
  assert.equal(result.https,true);
  assert.equal(result.sameOrigin,true);
  assert.equal(result.targetOrigin,"https://agent.example");
  assert.equal(result.targetPath,"/login");
  assert.equal(result.queryPresent,false);
  assert.equal(result.requiresExplicitOriginAuthorization,false);
  assert.equal(result.safeForFutureProbe,true);
});

test("redirect classifier hashes query values instead of exposing them",()=>{
  const result=classifyA2aRuntimeRedirect(
    "https://agent.example/a2a",
    "https://other.example/continue?token=secret-value#fragment"
  );
  assert.equal(result.targetOrigin,"https://other.example");
  assert.equal(result.targetPath,"/continue");
  assert.equal(result.queryPresent,true);
  assert.match(result.querySha256,/^[a-f0-9]{64}$/);
  assert.equal(result.fragmentPresent,true);
  assert.equal(result.requiresExplicitOriginAuthorization,true);
  assert.equal(result.safeForFutureProbe,false);
  assert.equal(JSON.stringify(result).includes("secret-value"),false);
});


test("access gate classifier recognizes Cloudflare Access login redirects",()=>{
  const redirect=classifyA2aRuntimeRedirect(
    "https://agent.example/",
    "https://example.cloudflareaccess.com/cdn-cgi/access/login/agent.example?kid=opaque"
  );
  const gate=classifyA2aAccessGate(redirect);
  assert.equal(gate.detected,true);
  assert.equal(gate.kind,"access-gate");
  assert.equal(gate.provider,"cloudflare-access");
  assert.equal(gate.state,"reachable-but-access-gated");
  assert.equal(gate.enrollmentRequired,true);
  assert.equal(gate.publicCredentialDiscovered,false);
  assert.equal(gate.authenticationAttempted,false);
  assert.equal(gate.credentialPresented,false);
  assert.equal(gate.redirectFollowed,false);
  assert.deepEqual(gate.permittedCredentialSources,[
    "owner-issued-service-token",
    "owner-approved-oauth-or-idp",
    "owner-approved-mtls-certificate",
    "owner-published-public-a2a-endpoint"
  ]);
});

test("access gate classifier does not treat same-origin redirect as external gate",()=>{
  const redirect=classifyA2aRuntimeRedirect("https://agent.example/","/login");
  const gate=classifyA2aAccessGate(redirect);
  assert.equal(gate.detected,false);
  assert.equal(gate.state,"not-detected");
  assert.equal(gate.enrollmentRequired,false);
});

test("runtime probe records redirect but never follows it",async()=>{
  const result=await probeA2aRuntimeReachability({
    endpoint:"https://agent.example/a2a",
    networkEnabled:true,
    allowedOrigins:["https://agent.example"],
    lookupImpl:async()=>[{address:"93.184.216.34",family:4}],
    headImpl:async()=>({
      statusCode:302,
      location:"https://evil.example/",
      tlsAuthorized:true,
      remoteAddress:"93.184.216.34"
    })
  });
  assert.equal(result.redirectReceived,true);
  assert.equal(result.redirectFollowed,false);
  assert.equal(result.redirectLocationPersisted,false);
  assert.equal(result.redirectClassification.targetOrigin,"https://evil.example");
  assert.equal(result.redirectClassification.sameOrigin,false);
  assert.equal(result.redirectClassification.requiresExplicitOriginAuthorization,true);
  assert.equal(result.accessGate.detected,true);
  assert.equal(result.accessGate.state,"reachable-but-external-gate");
  assert.equal(result.accessGate.authenticationAttempted,false);
  assert.equal(result.accessGate.credentialPresented,false);
});

test("runtime probe refuses a remote IP different from the pinned DNS address",async()=>{
  await assert.rejects(
    ()=>probeA2aRuntimeReachability({
      endpoint:"https://agent.example/a2a",
      networkEnabled:true,
      allowedOrigins:["https://agent.example"],
      lookupImpl:async()=>[{address:"93.184.216.34",family:4}],
      headImpl:async()=>({
        statusCode:200,
        tlsAuthorized:true,
        remoteAddress:"93.184.216.35"
      })
    }),
    /did not match pinned DNS/
  );
});
