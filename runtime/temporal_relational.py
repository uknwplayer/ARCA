from dataclasses import dataclass
from datetime import datetime

class TemporalRelationError(ValueError): pass
@dataclass(frozen=True)
class Event:
 id:str; occurred_at:str; kind:str; provenance_refs:tuple[str,...]
@dataclass(frozen=True)
class Relation:
 source:str; target:str; kind:str; basis:str; provenance_refs:tuple[str,...]; status:str="OBSERVED"

ALLOWED_STATUS={"OBSERVED","INFERRED_FOR_REVIEW","CONTRADICTED"}
def _dt(v):
 try:return datetime.fromisoformat(v.replace("Z","+00:00"))
 except ValueError as e: raise TemporalRelationError("invalid timestamp") from e
def validate_event(e):
 if not e.id.strip() or not e.kind.strip() or not e.provenance_refs: raise TemporalRelationError("event provenance required")
 _dt(e.occurred_at)
def timeline(events):
 for e in events: validate_event(e)
 return tuple(sorted(events,key=lambda e:(_dt(e.occurred_at),e.id)))
def validate_relation(r,node_ids):
 if r.source not in node_ids or r.target not in node_ids: raise TemporalRelationError("unknown relation endpoint")
 if r.status not in ALLOWED_STATUS: raise TemporalRelationError("unsupported relation status")
 if not r.kind.strip() or not r.basis.strip() or not r.provenance_refs: raise TemporalRelationError("relation basis/provenance required")
