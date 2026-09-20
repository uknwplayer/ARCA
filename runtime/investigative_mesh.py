from dataclasses import dataclass
from runtime.executor_mesh.mission import MissionChild,MissionRequest,deterministic_job_id
from runtime.executor_mesh.model import JobRequest

class InvestigativeMeshError(ValueError): pass
ALLOWED_TASKS=frozenset({"PUBLIC_SOURCE_NORMALIZATION","ABSTRACT_TRACE_EXTRACTION","SOURCE_LOCATOR_VERIFICATION","TYPOLOGY_MATCHING"})
@dataclass(frozen=True)
class InvestigativeChildSpec:
 child_id:str;task_class:str;public_sanitized:bool=True;contains_case_sensitive_data:bool=False;contains_raw_artifact:bool=False;secrets_required:bool=False

def build_public_mission(mission_id,specs,*,completion_policy="all_required"):
 children=[]
 for s in specs:
  if s.task_class not in ALLOWED_TASKS: raise InvestigativeMeshError("task class not allowlisted")
  if not s.public_sanitized or s.contains_case_sensitive_data: raise InvestigativeMeshError("public mesh requires sanitized non-case-sensitive task")
  if s.contains_raw_artifact: raise InvestigativeMeshError("raw artifact cannot enter public mesh")
  if s.secrets_required: raise InvestigativeMeshError("secret-bearing investigative job forbidden")
  job=JobRequest(job_id=deterministic_job_id(mission_id,s.child_id),profile="smoke",required_capabilities=frozenset(),privacy="public",secrets_required=False,min_trust="VERIFIED")
  children.append(MissionChild(s.child_id,job))
 mission=MissionRequest(mission_id,tuple(children),completion_policy);mission.validate();return mission
