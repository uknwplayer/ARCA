# ARCA Defensive Typology Corpus V0.1

Status: PROPOSED PUBLIC CORPUS  
Roadmap: 4/16  
Date: 2026-09-20

## Purpose

Give ARCA a small, source-backed body of abstract investigative knowledge before any autonomous case learning is enabled.

The corpus stores **derived defensive knowledge**, not copies of reports, videos, PDFs, webpages, case files or investigative targets.

## Corpus unit

Each typology entry contains:

- stable typology id and title;
- defensive scope;
- abstract observable traces;
- red flags;
- lawful public source classes;
- bounded verification questions;
- source locators to authoritative/public material;
- explicit statement that a match is not a finding.

A corpus entry is admissible only when at least one source locator exists and every red flag has an observable trace and verification question.

## Initial seed

V0.1 deliberately starts small.

### Procurement — suspicious bidding patterns

Derived from OECD public procurement guidance. Detection knowledge includes repeated/rotating winning patterns, unexpected withdrawals or non-participation, unusual subcontracting relationships, and similarities across nominally competing bids. These are investigation leads, not proof of collusion.

### Procurement — integrity risks across the procurement cycle

Derived from OECD integrity guidance. Detection knowledge includes unusually restrictive/tailored tender conditions, non-competitive procedure use requiring justification, single-bid patterns, contract modifications, and post-award delivery/invoicing anomalies. Context and legitimate explanations must be tested.

### Beneficial ownership opacity

Derived from FATF beneficial-ownership material. Detection knowledge focuses on public-record inconsistencies or structures that obscure the natural persons controlling legal entities. Complexity or use of legal persons is not itself wrongdoing; the verification task is to establish ownership/control from lawful records and corroborating sources.

## Source policy

The corpus prefers authoritative institutional material and records a canonical locator instead of copying the source.

A source disappearing does not convert a prior abstraction into proof. Its locator may remain as historical provenance and the corpus entry can be reviewed, superseded or retired.

## Defensive boundary

The corpus records what an investigator can **observe and verify**. It does not retain step-by-step instructions for arranging collusion, concealing beneficial ownership, laundering proceeds, bypassing controls, or avoiding detection.

## Public/private boundary

**Public ARCA:** this corpus framework, source registry, reviewed abstract typologies, validation code and synthetic tests.

**Private investigative store:** matches against real people/entities/contracts, concrete source locators gathered during a case, hypotheses, timelines and evidence assessments.

**Neither:** raw source files or secrets.

## Completion criteria

Step 4 is complete when the source-backed seed corpus, machine validation and tests pass canonical CI and are merged.
