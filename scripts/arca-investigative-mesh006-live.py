#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
import json
import os
from pathlib import Path
import time

from runtime.executor_mesh import CostAwareScheduler, DispatchJournal, ExecutorMeshDispatcher, GitHubContentsQueueTransport, ProviderTransientError, QueueTargetPolicy, load_registry
from runtime.executor_mesh.investigative_queue import InvestigativeGitQueueAdapter
from runtime.executor_mesh.mission import build_mission_receipt
from runtime.investigative_mesh import InvestigativeChildSpec, build_public_mission

ROOT=Path(__file__).resolve().parents[1]

def iso(value):
    return datetime.fromisoformat(value.replace("Z","+00:00")) if value else None

def main():
    token=os.environ.get("ARCA_GITHUB_DISPATCH_TOKEN","")
    if not token:
        raise SystemExit("ARCA_GITHUB_DISPATCH_TOKEN is required")
    mission_id=os.environ.get("ARCA_MISSION_ID") or f"investigative-mesh006-live-{os.environ.get('GITHUB_RUN_ID','local')}"
    specs=(
        InvestigativeChildSpec("normalize","PUBLIC_SOURCE_NORMALIZATION",{"source_class":"official_public_fixture","fields":["document_id","locator","published_at"]}),
        InvestigativeChildSpec("traces","ABSTRACT_TRACE_EXTRACTION",{"observations":["TRACE-PUBLIC-AMOUNT","TRACE-PUBLIC-ID","TRACE-PUBLIC-TIME"]}),
        InvestigativeChildSpec("locators","SOURCE_LOCATOR_VERIFICATION",{"locators":["https://pncp.gov.br/"]}),
        InvestigativeChildSpec("typology","TYPOLOGY_MATCHING",{"signals":["RF-SYNTH-LOW-COMPETITION"],"typology_indicators":["RF-SYNTH-LOW-COMPETITION","RF-SYNTH-OWNERSHIP-OPACITY"]}),
    )
    mission=build_public_mission(mission_id,specs)
    payloads={child.job.job_id:(spec.task_class,spec.task_input) for child,spec in zip(mission.children,specs)}
    assignments={
        "normalize":"github-satellite-linux",
        "traces":"github-satellite-b-linux",
        "locators":"github-satellite-linux",
        "typology":"github-satellite-b-linux",
    }
    transport=GitHubContentsQueueTransport(
        token=token,
        allowed_targets={
            "uknwplayer/arca-execution-satellite":QueueTargetPolicy({"main":("queue/requests",)}),
            "uknwplayer/arca-execution-satellite-b":QueueTargetPolicy({"main":("queue/requests",)}),
        },
    )
    refs={}
    dispatch_rows=[]
    dispatchers={}
    for child in mission.children:
        target_executor=assignments[child.child_id]
        registry=load_registry(ROOT/"config"/"executor-registry")
        for executor_id,item in list(registry._executors.items()):
            registry._executors[executor_id]=type(item)(**{**item.__dict__,"available":executor_id==target_executor})
        adapter_a=InvestigativeGitQueueAdapter(transport,task_payloads=payloads,provider_family="github-git-queue")
        adapter_b=InvestigativeGitQueueAdapter(transport,task_payloads=payloads,provider_family="github-git-queue-b")
        dispatcher=ExecutorMeshDispatcher(CostAwareScheduler(registry),{"github-git-queue":adapter_a,"github-git-queue-b":adapter_b},DispatchJournal(),max_provider_attempts=1)
        decision=dispatcher.dispatch(child.job)
        refs[child.child_id]=decision.ref
        dispatchers[child.child_id]=dispatcher
        dispatch_rows.append({"child_id":child.child_id,"task_class":payloads[child.job.job_id][0],"executor_id":decision.ref.executor_id,"dispatch_commit_sha":decision.ref.external_id})

    accepted={}
    deadline=time.monotonic()+300
    pending={child.child_id:child for child in mission.children}
    while pending:
        for child_id,child in list(pending.items()):
            try:
                accepted[child_id]=dispatchers[child_id].collect(child.job)
                del pending[child_id]
            except ProviderTransientError:
                pass
        if pending:
            if time.monotonic()>=deadline:
                raise SystemExit("timed out waiting for investigative Mesh006 children: "+",".join(sorted(pending)))
            time.sleep(3)

    receipt=build_mission_receipt(mission,((child.child_id,accepted[child.child_id]) for child in mission.children))
    runs=[]
    for child in mission.children:
        meta=transport.run_metadata_by_head_sha(refs[child.child_id].external_id)
        if meta is None:
            raise SystemExit("missing workflow metadata for "+child.child_id)
        runs.append({"child_id":child.child_id,"executor_id":refs[child.child_id].executor_id,**meta})

    overlap=False
    for left in runs:
        for right in runs:
            if left["repository"]==right["repository"]:
                continue
            ls,le=iso(left["run_started_at"]),iso(left["updated_at"])
            rs,re=iso(right["run_started_at"]),iso(right["updated_at"])
            if ls and le and rs and re and max(ls,rs)<=min(le,re):
                overlap=True
    proof={
        "schema":"arca.investigative-mesh006-live-proof.v0.1",
        "mission_id":mission_id,
        "public_sanitized_only":True,
        "raw_artifacts_in_payload":False,
        "secrets_in_payload":False,
        "dispatches":dispatch_rows,
        "runs":runs,
        "cross_domain_overlap_observed":overlap,
        "mission_receipt":asdict(receipt),
    }
    print(json.dumps(proof,indent=2,sort_keys=True))
    if receipt.mission_state!="COMPLETED" or receipt.accepted_child_count!=4:
        return 2
    if len({row["executor_id"] for row in dispatch_rows})<2:
        return 3
    if not overlap:
        return 4
    return 0

if __name__=="__main__":
    raise SystemExit(main())
