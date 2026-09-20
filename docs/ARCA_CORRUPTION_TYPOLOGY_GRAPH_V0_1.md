# ARCA Corruption Typology Graph (CTG) V0.1

Status: PROPOSED ENFORCEABLE MODEL  
Roadmap: 3/16  
Date: 2026-09-20

## Purpose

Represent documented corruption, fraud, public-resource diversion and money-laundering **detection patterns** as a graph that ARCA can later compare with lawful public data.

CTG is a defensive analytical model. It represents observable traces and verification questions, not instructions for committing, concealing, or optimizing wrongdoing.

## Public pattern graph

The canonical public CTG stores abstract knowledge only:

`TYPOLOGY -> ACTOR_ROLE -> ENTITY_ROLE -> RELATIONSHIP -> EVENT -> RESOURCE_FLOW -> TRACE -> RED_FLAG -> SOURCE_CLASS -> VERIFICATION_QUESTION`

A public pattern node describes roles such as "contracting authority", "supplier", "intermediary" or "beneficial owner". It must not contain a case-specific named target merely to make the pattern concrete.

## Node kinds

- `TYPOLOGY`: documented defensive pattern family.
- `ACTOR_ROLE`: abstract human/institutional role relevant to a pattern.
- `ENTITY_ROLE`: abstract company, organization, account, contract or asset role.
- `RELATIONSHIP`: abstract relationship that may be observable.
- `EVENT`: event class relevant to a timeline.
- `RESOURCE_FLOW`: public-resource/value-flow class, expressed at detection level.
- `TRACE`: observable documentary/data trace.
- `RED_FLAG`: indicator that justifies verification, never a finding by itself.
- `SOURCE_CLASS`: lawful public source class capable of testing the indicator.
- `VERIFICATION_QUESTION`: bounded question an investigator/worker can test.
- `DOCUMENTED_CASE_PATTERN`: abstracted lesson from a documented case, stripped of unnecessary case-specific identity.

## Edge semantics

Edges are typed and directional. V0.1 allows:

- `HAS_ROLE`
- `INVOLVES_ENTITY_ROLE`
- `MAY_CREATE_RELATIONSHIP`
- `MAY_PRODUCE_EVENT`
- `MAY_AFFECT_RESOURCE_FLOW`
- `MAY_LEAVE_TRACE`
- `MAY_INDICATE`
- `TESTABLE_WITH`
- `ASK`
- `ABSTRACTED_FROM`

Words such as `MAY_` are intentional: the graph models hypotheses and observable signatures, not deterministic guilt rules.

## Red-flag invariant

Every `RED_FLAG` must be connected to at least one observable `TRACE`, one lawful `SOURCE_CLASS`, and one `VERIFICATION_QUESTION` before it is considered usable by future detectors.

A red flag cannot contain or imply a conclusion that a named person committed an offense.

## Evidence boundary

CTG does not replace Evidence Taxonomy V0.1. When a future case graph matches a CTG pattern, the match begins as an analytical observation. Any claim about a real case must be separately represented and assessed under the evidence taxonomy with source locators.

## Defensive-detail boundary

CTG may retain enough mechanics to recognize a documented pattern, including actor roles, relationships, observable events, public-resource flows and traces.

It must exclude unnecessary procedural detail whose primary utility is teaching how to execute, hide, evade detection of, or improve a corrupt/fraudulent/laundering scheme.

## Public/private repository boundary

**Public ARCA:** CTG schema, generic graph engine, abstract typologies, defensive red flags, lawful source classes, verification questions, synthetic tests, and later reviewed abstractions from documented cases.

**Private investigative store:** case-specific named entities, concrete relationships, hypotheses, source locators, timelines and evidence assessments generated during an investigation.

**Neither repository:** raw uploaded/source artifacts or secrets.

The private Registry remains project checkpoint/archive and is not the case graph.

## Completion criteria

CTG V0.1 is complete when:

1. node/edge vocabulary and defensive invariants are documented;
2. machine-readable policy exists;
3. runtime validation rejects unknown node/edge kinds and unsafe red flags;
4. tests prove a usable red flag requires trace + source class + verification question;
5. canonical CI passes and the change is merged.
