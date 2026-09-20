# ARCA Investigative Boundary V0.1

Status: PROPOSED ENFORCEABLE BOUNDARY  
Date: 2026-09-20

## Purpose

Define the acquisition and analysis boundary for ARCA investigative workloads before corruption typologies, public-record monitoring, autonomous case generation, or Mesh006 investigative missions are enabled.

The boundary is intentionally source- and method-based. It does not decide whether a person or organization is suspicious, guilty, trustworthy, or politically desirable.

## Core rule

ARCA investigative acquisition is **public-record first and lawful-access only**.

A source being interesting, relevant, or widely discussed does not authorize bypassing access controls or collecting private material.

## Allowed source classes

ARCA may acquire and analyze material from:

- official public records and open-government datasets;
- public procurement, contract, spending, transfer and budget records;
- public legislative and administrative records;
- judicial records that are lawfully public;
- public corporate/beneficial-ownership registries where lawful access is provided;
- public sanctions, debarment and PEP datasets;
- public official gazettes and notices;
- public statements, posts and publications of public officeholders from publicly accessible profiles;
- public news/reporting and other openly accessible publications, with provenance;
- user-supplied material, as an allegation/evidence input whose claims still require independent verification.

## Allowed access methods

Initial V0.1 acquisition methods are deliberately narrow:

- ordinary public HTTP access;
- official/public APIs;
- public feeds or bulk downloads;
- user-supplied files/material.

Access must honor the source's lawful access boundary. Authentication that grants private or privileged access is outside this V0.1 investigative acquisition path.

## Forbidden acquisition methods

ARCA must reject investigative tasks that require or propose:

- credential theft, guessing, stuffing or reuse;
- authentication/access-control bypass;
- exploitation of vulnerabilities;
- malware, spyware or persistence;
- impersonation, phishing, pretexting or social engineering to obtain non-public data;
- intrusion into private servers, devices, accounts or networks;
- interception of private communications;
- acquisition or operational use of stolen credentials;
- acquisition of knowingly stolen/private datasets as an autonomous collection method;
- evasion of technical controls intended to make non-public material accessible;
- secret-bearing public execution jobs.

This restriction applies even when the intended investigation concerns corruption or another serious allegation.

## Repository retention boundary

Raw investigative inputs are processing material, not repository content.

ARCA repositories must not be used as media/document stores for uploaded videos, audio, images, PDFs, archives, scraped page dumps, or equivalent raw investigative files. This applies to both public and private project repositories.

A worker may process an input transiently, then persist only the minimum derived knowledge needed by the investigation: structured observations, extracted claims, normalized entities/relations, hashes or source references needed for provenance, and later evidence classifications. Derived data must still obey privacy, evidence, and public/private publication rules.

A source URL or cryptographic digest may identify an external/input artifact without copying that artifact into a repository. Temporary executor artifacts must follow their existing bounded retention policy and are not an investigative archive.

Public ARCA stores generic code, schemas, abstract typologies, tests, and non-case-specific documentation. Case-specific derived investigative knowledge remains in the designated private investigative store when one is introduced. The private Registry remains a project checkpoint/archive and is not the investigative corpus.

## Sensitive and private information

Public availability does not automatically make every personal detail relevant.

Investigative collection should minimize personal data and retain only what is materially connected to a documented public-interest hypothesis or provenance requirement. Private communications, credentials, authentication material, intimate information, and unrelated sensitive personal data are outside the investigative corpus.

If a public official record lawfully contains personal information, the record may be referenced when materially necessary, but unnecessary personal fields should not be replicated into derived datasets.

## Public-officeholder publications

The Public-Record Watcher may inspect publicly accessible publications by public officeholders within a defined monitoring scope.

It may preserve provenance and identify content for documented review categories. It must not:

- infer private beliefs or undisclosed personal characteristics;
- convert an automated classification into a factual accusation;
- rank politicians, recommend votes, or produce electoral persuasion;
- strip statements from materially relevant context;
- represent deleted/private material as currently public merely because a third party claims it existed.

Potentially offensive, discriminatory, unlawful, misleading, or reputationally relevant material is a **review lead**, not a conclusion. Legal or factual conclusions require appropriate evidence and sourcing.

## Allegations versus facts

User-supplied videos, posts, journalism, complaints and third-party claims may initiate an investigative lead. Their claims do not enter ARCA as established fact merely because the material is public.

V0.1 requires provenance to remain attached so the future Evidence Taxonomy can distinguish allegation, anomaly, correlation, documentary evidence, official confirmation, contested claims and refutation.

## Public corruption-pattern research

ARCA may study documented corruption, fraud and money-laundering typologies for defensive detection. The intended representation is:

`documented pattern -> observable traces -> red flags -> public data sources -> verification questions`

The investigative corpus should not be optimized as an operational evasion manual. Detection-relevant mechanics may be represented when necessary to recognize a pattern, while avoiding unnecessary procedural detail whose primary utility would be committing or concealing wrongdoing.

## Output boundary

ARCA investigative outputs must preserve the distinction between:

- a source saying something;
- ARCA observing a data relationship or anomaly;
- independently corroborated evidence;
- an official finding or adjudicated fact.

A red flag is never, by itself, a finding of corruption.

Every material investigative assertion should be traceable to provenance suitable for later chain-of-custody processing.

## Mesh / executor boundary

Public investigative child jobs may be sent to public execution domains only when their payload itself satisfies this boundary and contains no secrets or private data.

Executor eligibility, trust and admission remain governed by Executor Mesh. An investigative worker gains no additional authority merely because it specializes in investigations.

## Fail-closed rule

When ARCA cannot establish that an acquisition method and source class are permitted by this boundary, autonomous acquisition must stop and request policy review rather than broadening access.

## Versioning

V0.1 is deliberately restrictive. Any expansion of allowed source classes or access methods requires a reviewed version change. Workers and executors cannot expand this boundary themselves.

## Completion criteria

Investigative Boundary V0.1 is complete when:

1. this normative specification exists;
2. the boundary has a machine-enforceable policy representation;
3. automated tests prove allowed public acquisition and rejection of representative forbidden/private paths;
4. CI passes and the change is merged into canonical ARCA.
