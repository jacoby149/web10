# Recover completed work, not guesses — workflow recovery contract

The operator requests recovery across the whole preparation/experiment flow:
generation, validation, transfer, import, trials and final receipts. A crash
must not erase completed long work. A checkpoint grants no execution authority,
never changes the dataset, and never promotes an interrupted operation to done.

**Keep the pipeline straightforward:** generate → private recovery archive →
validate → freeze → experiments. Use one validator process and sensible
partitions. Completed stages/buckets are verified and reused on restart; redo
only unfinished work. No distributed shard fleet, scheduler or distributed
merge framework is part of this scope. Once an immutable dataset has passed
full validation, transfers verify its hashes and trials retain their own import/
correctness controls; do not repeat full statistical validation for every trial.
This document captures the contract; implementation remains OPEN.

## Completion boundaries

| Stage | Durable unit | Resume requirement |
|---|---|---|
| Model/generation | completed model plans, graph batches, table exports, delivery chunks | exact source/recipe/runtime and file hashes; database effects and checkpoint commit together |
| Validation | canonicalization, admitted partition pass, individual SQL checks/exposure buckets | unchanged manifest/input bytes/source/runtime; committed database effects and cached exact results; partition inventories rehashed |
| Transfers | each complete verified object/file | exact size/digest readback; partial files never become final files |
| Import | each verified table on the same owned live target | live target identity and content proof; no blind INSERT replay after uncertain writes |
| Experiments | each completed trial and its raw artifacts, including completed failures | exact input/config/seed/source/envelope; interruption is a separate failed attempt, never splice partial measurement windows |
| Retention | complete snapshot of checkpoint state and referenced artifacts | independently stored, digest-readback verified private quarantine; final acceptance remains separate |

The new derived-input node-import/study integration is not yet executable.
Do not silently route it through historical V2 runners or invent acceptance.
Shared recovery primitives do not establish missing connected integrations.

## State rules

1. Bind every workspace to its input identity, recipe/config, source fingerprints
   and runtime. Stale workspaces are refused and retained, never silently reset.
2. Hold an exclusive process lock. A database operation and its completion row
   belong in the same transaction. Crash before commit means redo that unit;
   crash after commit means verify and reuse it.
3. Files need intent, an atomic completion marker and exact artifact inventories.
   Preserve uncommitted partial output separately. Missing/corrupt completed
   files are refused, not overwritten or waved through as passed checks.
4. Log work-start, commit, replay and refusal with stage/unit identifiers and
   safe metadata. No saved tokens, private HTTP content or credentials.
5. Failed semantic checks remain failed when replayed. A recoverable execution
   interruption is different from a completed negative validation result.
6. Same-disk recovery is not host-loss recovery. The checkpoint database/WAL,
   immutable input and referenced artifacts must all survive together. A
   coherent closed/snapshotted copy is required before archival—not a racing
   copy of a live database. Connected independent archival remains a restart gate.

No new paid run, storage write, experiment, public posting or resource lifetime
extension is authorized by this implementation task.
