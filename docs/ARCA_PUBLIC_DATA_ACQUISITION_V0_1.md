# ARCA Public Data Acquisition Layer V0.1

Status: PROPOSED — Roadmap 7/16

The acquisition layer turns reviewed public-source descriptors into bounded acquisition plans. It does not grant broader access than Investigative Boundary V0.1.

V0.1 seed sources are official/public Brazilian transparency interfaces: Portal da Transparência open downloads/API, CGU open-data catalogue, and TCU public webservices.

A source descriptor records source class, canonical URL, access method, expected format and provenance policy. Acquisition plans reject private authentication, unknown source classes/methods, missing provenance, and secret-bearing jobs.

Large public datasets should be streamed/processed transiently; ARCA repositories persist only derived knowledge and source locators, never downloaded dataset/media copies.

Public ARCA stores adapters/descriptors/tests. Concrete acquired records and case-derived observations belong in private investigative storage when retained.
