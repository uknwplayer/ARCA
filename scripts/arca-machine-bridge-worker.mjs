#!/usr/bin/env node
import {join} from "node:path";

process.env.ARCA_AGENT_ONCE=process.env.ARCA_AGENT_ONCE||"1";
process.env.ARCA_AGENT_TRANSPORT=process.env.ARCA_AGENT_TRANSPORT||"filesystem";
process.env.ARCA_AGENT_QUEUE_DIR=process.env.ARCA_AGENT_QUEUE_DIR||join(process.cwd(),"remote-jobs");
process.env.ARCA_WORKER_ID=process.env.ARCA_WORKER_ID||"github-actions";
process.env.ARCA_WORKER_CAPABILITIES=process.env.ARCA_WORKER_CAPABILITIES||"node,repository";

await import("./arca-worker-agent.mjs");
