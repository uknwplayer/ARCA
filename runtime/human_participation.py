from dataclasses import dataclass, field
import hashlib
import json

class HumanParticipationError(ValueError):
    pass

INVESTIGATION_STATES = (
    "LEAD",
    "TRIAGE",
    "COLLECTION",
    "ANALYSIS",
    "ADVERSARIAL_VERIFICATION",
    "HUMAN_REVIEW",
    "PUBLICABLE",
    "INCONCLUSIVE",
    "REFUTED",
    "ARCHIVED",
)

TRIGGER_KINDS = {
    "AUTONOMOUS_ANOMALY",
    "PUBLIC_SOURCE_CHANGE",
    "HUMAN_REQUEST",
    "HUMAN_PUBLIC_SOURCE",
    "HUMAN_DISPUTE",
    "SCHEDULED_REVIEW",
}

CONTRIBUTION_KINDS = {
    "WATCH",
    "COMMENT",
    "CONFIRMATION",
    "PUBLIC_SOURCE",
    "DISPUTE",
    "DEEPEN_REQUEST",
}

_WAKE_CONTRIBUTIONS = {"PUBLIC_SOURCE", "DISPUTE", "DEEPEN_REQUEST"}

_TRANSITIONS = {
    "LEAD": {"TRIAGE", "ARCHIVED"},
    "TRIAGE": {"COLLECTION", "INCONCLUSIVE", "ARCHIVED"},
    "COLLECTION": {"ANALYSIS", "INCONCLUSIVE", "ARCHIVED"},
    "ANALYSIS": {"ADVERSARIAL_VERIFICATION", "COLLECTION", "INCONCLUSIVE"},
    "ADVERSARIAL_VERIFICATION": {"HUMAN_REVIEW", "ANALYSIS", "REFUTED", "INCONCLUSIVE"},
    "HUMAN_REVIEW": {"PUBLICABLE", "ANALYSIS", "REFUTED", "INCONCLUSIVE", "ARCHIVED"},
    "PUBLICABLE": {"HUMAN_REVIEW", "ARCHIVED"},
    "INCONCLUSIVE": {"COLLECTION", "ARCHIVED"},
    "REFUTED": {"HUMAN_REVIEW", "ARCHIVED"},
    "ARCHIVED": set(),
}


def _normalized(value, field_name):
    text = " ".join(str(value or "").strip().casefold().split())
    if not text:
        raise HumanParticipationError(field_name + " required")
    return text


def canonical_investigation_key(*, jurisdiction, subject_ref, topic, time_window, source_scopes):
    scopes = sorted({_normalized(value, "source scope") for value in source_scopes})
    if not scopes:
        raise HumanParticipationError("source scopes required")
    payload = {
        "jurisdiction": _normalized(jurisdiction, "jurisdiction"),
        "subject_ref": _normalized(subject_ref, "subject_ref"),
        "topic": _normalized(topic, "topic"),
        "time_window": _normalized(time_window, "time_window"),
        "source_scopes": scopes,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return "investigation-" + hashlib.sha256(encoded.encode()).hexdigest()[:24]


@dataclass
class SharedInvestigation:
    investigation_key: str
    jurisdiction: str
    subject_ref: str
    topic: str
    time_window: str
    source_scopes: tuple[str, ...]
    state: str = "LEAD"
    subscribers: set[str] = field(default_factory=set)
    triggers: set[tuple[str, str]] = field(default_factory=set)
    contributions: list[tuple[str, str, str]] = field(default_factory=list)
    pending_wake_reasons: set[str] = field(default_factory=set)

    def subscribe(self, participant_ref):
        participant = _normalized(participant_ref, "participant_ref")
        before = len(self.subscribers)
        self.subscribers.add(participant)
        return len(self.subscribers) != before

    def add_trigger(self, kind, trigger_ref):
        if kind not in TRIGGER_KINDS:
            raise HumanParticipationError("unsupported trigger kind")
        reference = _normalized(trigger_ref, "trigger_ref")
        trigger = (kind, reference)
        if trigger in self.triggers:
            return False
        self.triggers.add(trigger)
        self.pending_wake_reasons.add(kind + ":" + reference)
        return True

    def contribute(self, *, participant_ref, kind, reference):
        participant = _normalized(participant_ref, "participant_ref")
        if kind not in CONTRIBUTION_KINDS:
            raise HumanParticipationError("unsupported contribution kind")
        ref = _normalized(reference, "reference")
        item = (participant, kind, ref)
        if item in self.contributions:
            return False
        self.contributions.append(item)
        self.subscribers.add(participant)
        if kind in _WAKE_CONTRIBUTIONS:
            self.pending_wake_reasons.add("HUMAN_" + kind + ":" + ref)
        return True

    @property
    def worker_demand(self):
        return len(self.pending_wake_reasons)

    def claim_wake_reasons(self):
        claimed = tuple(sorted(self.pending_wake_reasons))
        self.pending_wake_reasons.clear()
        return claimed

    def transition(self, target_state, *, human_reviewed=False):
        if target_state not in INVESTIGATION_STATES:
            raise HumanParticipationError("unsupported investigation state")
        if target_state not in _TRANSITIONS[self.state]:
            raise HumanParticipationError("invalid investigation transition")
        if target_state == "PUBLICABLE" and human_reviewed is not True:
            raise HumanParticipationError("publicable requires explicit human review")
        self.state = target_state


class AutonomousParticipationNetwork:
    def __init__(self):
        self.investigations = {}

    def request_investigation(
        self,
        *,
        jurisdiction,
        subject_ref,
        topic,
        time_window,
        source_scopes,
        trigger_kind,
        trigger_ref,
        participant_ref=None,
    ):
        key = canonical_investigation_key(
            jurisdiction=jurisdiction,
            subject_ref=subject_ref,
            topic=topic,
            time_window=time_window,
            source_scopes=source_scopes,
        )
        created = key not in self.investigations
        if created:
            self.investigations[key] = SharedInvestigation(
                investigation_key=key,
                jurisdiction=jurisdiction,
                subject_ref=subject_ref,
                topic=topic,
                time_window=time_window,
                source_scopes=tuple(sorted(set(source_scopes))),
            )
        investigation = self.investigations[key]
        if participant_ref is not None:
            investigation.subscribe(participant_ref)
        awakened = investigation.add_trigger(trigger_kind, trigger_ref)
        return investigation, created, awakened
