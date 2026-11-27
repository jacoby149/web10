# Task block — change the sustained load test's host to the derived requirement: 16 cores, 32 threads, 32 GB RAM

Amend the host specification in the sustained-DAU load test contract (PR #1638,
`research/experiments/costfn/DAU-SUSTAINED-LOAD.md`) and in every document that
carries the old floor. This block changes the host the test runs on. It changes
nothing else in the contract.

## The change

The host floor is replaced. Where the contract now requires a host of at least
64 threads and at least 128 GB RAM, it is to require:

- 16 cores / 32 threads
- 32 GB RAM
- DigitalOcean dedicated-CPU class (or the closest class the provider offers at
  those resources), local storage as the class provides it

The admission vehicle for the sustained run (the 26.10 vehicle, PR #1682) is
re-pointed at the new host class. The $25 compute cap already approved stands
unchanged; the smaller host costs less per hour, and the cap is a cap, not a
target.

## Why, stated for the record

The 64-thread / 128 GB floor described the R630 as configured. It was not a
measured minimum. The requirement derived from the banked per-read costs is
smaller:

The full-store hybrid's measured samples carry 1,390 to 1,533 ms of summed
native engine time per complete read. At the contract peak of 15 reads per
second that is roughly 21 thread-seconds per second, and summed native duration
overstates CPU because it includes waits. A 32-thread host covers the peak
engine demand with headroom for the application side, the writer stream, and
merges.

No measurement in the programme made RAM the binding quantity. The full-store
experiments — restore, satellite builds, measured reads — ran inside a 32 GB
envelope; the largest measured read statement peaked near 110 MB.

The test therefore runs at the derived requirement instead of at one machine's
configuration, and the claim it supports is stated against that host: a
16-core node with 32 GB of RAM — a machine class a reader can rent or own
without translation.

## What does not change

- The workload: the frozen million-account store from snapshot 255003176,
  complete uniform K20 reads through the public API, the writer stream at 1
  post per second.
- The phases: warm-up 300 s at 15 reads/s (excluded), peak 600 s at 15 reads/s,
  average 1,800 s at 2.9 reads/s, drain.
- The steady-state precondition: OPTIMIZE on the hot tables with a parts census
  banked before the windows; background merges stay active during the windows.
- The gates: the slope gate (start value, end value, and slope for parts count,
  merge-queue bytes, pending mutations, in-flight reads, host RSS plus engine
  memory, and disk free, in the calibration and both measured windows); the
  drain gate; exact ordered parity of every measured response against the
  independent oracle; the pre-declared stop conditions, each of which banks its
  result.
- Custody: archives SHA-256-verified off-host before deletion; snapshot
  255003176 retained.
- The claim boundaries in §7 and §10, restated only where they name the host:
  the budget derives requirements, and the run now stands at the derived
  requirement.

## One fence

If calibration establishes that this host class cannot hold the restored store
at the declared steady state — a sizing fact about the restore, not a load
result — report that finding as itself the result, with the binding resource
named. Do not silently substitute a larger host.

Saved as task-block-load-test-host-16c-32gb.md with the other blocks. One
consequence to be aware of when you send it: the DAU preparation merged today —
the restore sizing and envelope work in #1684 through #1692 — was written
against the old floor, so expect the workspace to re-point those pieces at the
new envelope before the run. That's a small, mechanical adjustment, and it's
cheaper now than after the sized host is provisioned.
