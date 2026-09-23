import test from "node:test";
import assert from "node:assert/strict";
import {
  ExecutionEndpointRegistry,
  createExecutionEndpointDescriptor
} from "../src/machine-bridge/execution-endpoint.mjs";
import {
  probeVinceV5Heartbeat,
  observeVinceV5Ack,
  selectVinceV5Route
} from "../src/machine-bridge/vince-v5-endpoint-availability.mjs";

const NOW="2026-09-23T08:00:00.000Z";
const WAKE_ID="a".repeat(64);

function registryWith({
  endpointId="work",
  capabilities=["reasoning"],
  heartbeat,
  ack
}={}){
  const registry=new ExecutionEndpointRegistry();
  const operations={heartbeat:typeof heartbeat==="function",ack:typeof ack==="function"};
  registry.register(
    createExecutionEndpointDescriptor({
      endpointId,
      participantKind:"agent",
      capabilities,
      operations,
      transport:{kind:"test"}
    }),
    {
      ...(heartbeat?{heartbeat}:{}),
      ...(ack?{ack}:{})
    }
  );
  return registry;
}

test("V5 heartbeat surface reachability is not treated as executor availability",async()=>{
  const registry=registryWith({
    heartbeat:async()=>({available:true,workExecutionObserved:false})
  });
  const observation=await probeVinceV5Heartbeat({registry,endpointId:"work",now:NOW});
  assert.equal(observation.state,"INCONCLUSIVE");
  assert.equal(observation.reason,"SURFACE_REACHABLE_EXECUTION_UNPROVEN");
  assert.equal(observation.surfaceReachable,true);
  assert.equal(observation.routeEligible,false);
  assert.equal(observation.authority.executionAuthority,false);
});

test("V5 accepts explicit heartbeat unavailable but generic probe errors stay inconclusive",async()=>{
  const unavailable=registryWith({endpointId:"down",heartbeat:async()=>({available:false})});
  const down=await probeVinceV5Heartbeat({registry:unavailable,endpointId:"down",now:NOW});
  assert.equal(down.state,"UNREACHABLE");

  const broken=registryWith({endpointId:"broken",heartbeat:async()=>{throw new Error("network")}}); 
  const unknown=await probeVinceV5Heartbeat({registry:broken,endpointId:"broken",now:NOW});
  assert.equal(unknown.state,"INCONCLUSIVE");
  assert.equal(unknown.reason,"HEARTBEAT_ERROR");
});

test("V5 accepts GitHub-style ACK timestamps without fractional seconds",async()=>{
  const registry=registryWith({
    ack:async()=>({
      acknowledged:true,
      observedAt:"2026-09-23T07:59:30Z"
    })
  });
  const observation=await observeVinceV5Ack({
    registry,endpointId:"work",ackInput:{wakeId:WAKE_ID},now:NOW,maxAckAgeMs:120_000
  });
  assert.equal(observation.state,"AVAILABLE");
  assert.equal(observation.evidence.ackObservedAt,"2026-09-23T07:59:30.000Z");
});

test("V5 recent correlated ACK makes a route temporarily eligible",async()=>{
  const registry=registryWith({
    ack:async()=>({
      acknowledged:true,
      observedAt:"2026-09-23T07:59:30.000Z"
    })
  });
  const observation=await observeVinceV5Ack({
    registry,
    endpointId:"work",
    ackInput:{wakeId:WAKE_ID},
    now:NOW,
    maxAckAgeMs:120_000
  });
  assert.equal(observation.state,"AVAILABLE");
  assert.equal(observation.wakeAcknowledged,true);
  assert.equal(observation.routeEligible,true);
  assert.equal(observation.validUntil,"2026-09-23T08:01:30.000Z");
});

test("V5 missing or stale ACK never becomes an unreachable claim",async()=>{
  const missing=registryWith({endpointId:"missing",ack:async()=>({acknowledged:false})});
  const absent=await observeVinceV5Ack({
    registry:missing,endpointId:"missing",ackInput:{wakeId:WAKE_ID},now:NOW,maxAckAgeMs:60_000
  });
  assert.equal(absent.state,"INCONCLUSIVE");
  assert.equal(absent.reason,"ACK_NOT_OBSERVED");

  const stale=registryWith({
    endpointId:"stale",
    ack:async()=>({acknowledged:true,observedAt:"2026-09-23T07:50:00.000Z"})
  });
  const old=await observeVinceV5Ack({
    registry:stale,endpointId:"stale",ackInput:{wakeId:WAKE_ID},now:NOW,maxAckAgeMs:60_000
  });
  assert.equal(old.state,"INCONCLUSIVE");
  assert.equal(old.reason,"ACK_STALE");
  assert.equal(old.routeEligible,false);
});

test("V5 route selection filters capability and requires a fresh AVAILABLE ACK observation",async()=>{
  const registry=new ExecutionEndpointRegistry();
  for(const [id,caps] of [["a",["reasoning"]],["b",["reasoning"]],["c",["storage"]]]){
    registry.register(
      createExecutionEndpointDescriptor({
        endpointId:id,participantKind:"agent",capabilities:caps,
        operations:{ack:true},transport:{kind:"test"}
      }),
      {ack:async()=>({acknowledged:true,observedAt:id==="b"?"2026-09-23T07:59:50.000Z":"2026-09-23T07:59:00.000Z"})}
    );
  }
  const a=await observeVinceV5Ack({registry,endpointId:"a",ackInput:{wakeId:WAKE_ID},now:NOW,maxAckAgeMs:120_000});
  const b=await observeVinceV5Ack({registry,endpointId:"b",ackInput:{wakeId:WAKE_ID},now:NOW,maxAckAgeMs:120_000});
  const c=await observeVinceV5Ack({registry,endpointId:"c",ackInput:{wakeId:WAKE_ID},now:NOW,maxAckAgeMs:120_000});

  const route=selectVinceV5Route({
    registry,capability:"reasoning",observations:[a,b,c],now:NOW
  });
  assert.equal(route.state,"AVAILABLE");
  assert.equal(route.selectedEndpointId,"b");
  assert.equal(route.candidateCount,2);
  assert.equal(route.eligibleCount,2);
  assert.equal(route.dispatchPerformed,false);
  assert.equal(route.authority.executionAuthority,false);
});

test("V5 newer negative evidence overrides an older still-fresh ACK",async()=>{
  const registry=registryWith({ack:async()=>({acknowledged:true,observedAt:"2026-09-23T07:59:00.000Z"})});
  const available=await observeVinceV5Ack({
    registry,endpointId:"work",ackInput:{wakeId:WAKE_ID},now:NOW,maxAckAgeMs:180_000
  });
  const newer=Object.freeze({
    ...available,
    state:"UNREACHABLE",
    reason:"EXPLICIT_HEARTBEAT_UNAVAILABLE",
    source:"heartbeat",
    observedAt:"2026-09-23T08:00:30.000Z",
    validUntil:"2026-09-23T08:01:30.000Z",
    routeEligible:false,
    wakeAcknowledged:false
  });
  const route=selectVinceV5Route({
    registry,capability:"reasoning",observations:[available,newer],now:"2026-09-23T08:00:45.000Z"
  });
  assert.equal(route.state,"INCONCLUSIVE");
  assert.equal(route.selectedEndpointId,null);
  assert.equal(route.candidates[0].latestState,"UNREACHABLE");
});

test("V5 refuses to fabricate a route when only heartbeat evidence exists",async()=>{
  const registry=registryWith({heartbeat:async()=>({available:true})});
  const hb=await probeVinceV5Heartbeat({registry,endpointId:"work",now:NOW});
  const route=selectVinceV5Route({registry,capability:"reasoning",observations:[hb],now:NOW});
  assert.equal(route.state,"INCONCLUSIVE");
  assert.equal(route.selectedEndpointId,null);
  assert.equal(route.eligibleCount,0);
});

test("V5 expired AVAILABLE observations are not routable",async()=>{
  const registry=registryWith({ack:async()=>({acknowledged:true,observedAt:"2026-09-23T07:59:00.000Z"})});
  const ack=await observeVinceV5Ack({
    registry,endpointId:"work",ackInput:{wakeId:WAKE_ID},now:NOW,maxAckAgeMs:120_000
  });
  const route=selectVinceV5Route({
    registry,capability:"reasoning",observations:[ack],now:"2026-09-23T08:02:00.001Z"
  });
  assert.equal(route.state,"INCONCLUSIVE");
  assert.equal(route.selectedEndpointId,null);
});

test("V5 does not treat unsupported heartbeat or ACK as negative availability",async()=>{
  const registry=registryWith();
  const hb=await probeVinceV5Heartbeat({registry,endpointId:"work",now:NOW});
  const ack=await observeVinceV5Ack({registry,endpointId:"work",ackInput:{wakeId:WAKE_ID},now:NOW});
  assert.equal(hb.state,"INCONCLUSIVE");
  assert.equal(hb.reason,"HEARTBEAT_UNSUPPORTED");
  assert.equal(ack.state,"INCONCLUSIVE");
  assert.equal(ack.reason,"ACK_UNSUPPORTED");
});
