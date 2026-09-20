# ARCA Public-Record Watcher V0.1

Status: PROPOSED — Roadmap 8/16

A neutral monitoring contract for publicly accessible publications by public officeholders and other defined public-record sources.

The watcher may detect **review categories**, not political verdicts: provenance change, deletion/unavailability, potentially discriminatory/offensive language for human review, factual claim requiring verification, potential conflict/integrity relevance, and material change in an official public statement.

It must preserve URL/source id, publication/observation time when available, retrieval time, content hash when computed, and context locator. It stores derived observations rather than full media/page copies.

It must not infer private beliefs or protected traits, rank politicians, recommend votes, assess electability, predict elections, produce persuasion, strip material context, or turn automated classification into a factual/legal accusation.

Person-specific adverse output is private review material until a separate human-reviewed publication process decides otherwise. Public ARCA contains only watcher code/schema/tests.
