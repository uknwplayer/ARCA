# Worker Transport Contract

Transport is pluggable; the protocol does not require GitHub, Replit, HTTP, or a particular cloud.

A transport provides: discover(worker), claim(job, worker, lease), renew(claim), and publishResult(claim, result).

Claims require compare-and-set semantics at the authoritative store. Checking that a file does not exist and then writing it is not sufficient under concurrent workers. A worker that cannot claim delegates the job. A crashed worker loses ownership after lease expiry. Results should be idempotent by jobId and attempt.

Planned adapters: GitHub transport, filesystem transport for local development, and an HTTP broker transport for multi-machine deployments.
