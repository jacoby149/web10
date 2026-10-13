# The Failure — why the old way does not work

[← back to AI Security Theory](../README.md)

This is the post-mortem the whole theory exists to prevent. Read it first,
because every rule downstream is a direct answer to something that went wrong
here.

## What happened (PRs 1157 + 1159)

Two security-hardening PRs, opened the same week, ~90 files each:

- **#1157** — "Harden API security and add scoped app management delegation."
  Verified self/app credentials, RS256/JWKS, signed-origin revocable delegation,
  hardened query/document/media/HLS/import/recovery boundaries, removed secret
  defaults + sensitive logging. Touched `api/`, `sdk/`, `ui/`, the social app,
  and a dozen KB docs.
- **#1159** — "Harden SDK credential boundaries, RTC admission, and group-detail
  transport." Popup sender validation, credential redirects, cookie/JWT handling,
  one-use RTC tickets, credential-log redaction. Touched `api/`, `api/rtc/`,
  `sdk/`, the social app, CI, and deployment.

Both were still **open** when this theory was written. Both carried the same
tells in their own descriptions:

> #1157: *"…the opt-in live probe, live delegation gauntlet, deployment review,
> and independent audit **remain incomplete**."*
>
> #1159: *"**Coordinate overlapping API/KB changes with #1157 before merging** and
> deploy API/RTC/SDK/consumers together, with documented expiry, sender,
> diagnostic, issuer, and **historical-exposure follow-ups remaining open**."*

## The failure, named

A giant security PR is not a security PR. It is a **claim of security with no
evidence, merged on faith.** Five things went wrong, and each one maps to a rule
in this theory:

| What went wrong | Why it is fatal | The rule that answers it |
|---|---|---|
| **Unbounded scope** — "harden the security" has no edge | An agent claws at every surface at once and ships a sprawl | Rule 3: L1 is a bounded, file-by-file pass |
| **No provable done** — "no more vulns" can't be shown | You merge on a vibe, not a measure | Rule 4: the ledger *is* the done |
| **Two PRs overlapping** — #1159 had to "coordinate with #1157" | They touch the same trust boundaries; neither can be reviewed or reverted independently | Rule 1: one finding = one ≤500-line PR |
| **Unverifiable as a unit** — "E2E was not run," "audit remains incomplete" | A 90-file diff touching a trust boundary cannot be confirmed correct; a wrong line breaks a *guarantee*, not a feature | Rule 2 + 7: read-only parallel scans, tiny verifiable fixes |
| **The scary stuff parked** — "historical-exposure follow-ups remaining open" | The architectural risks got buried under the sprawl instead of tracked | Rule 3 + the Architect: L2 is a separate, visible backlog |

## The blast-radius math

When a 90-file PR touching trust boundaries is wrong — and a sprawl *will* be
wrong somewhere — the blast radius is the whole PR. You re-review 90 files to find
the one bad line, and you cannot revert the good 89 without the bad one.

The bite-sized + parallel model inverts that. A scan is read-only and free to
parallelize — eight workspaces across a scope cost the same as one and finish
eight times faster, each easier to trust. A fix PR is ~100 lines: the review is
bounded, the test is specific, the blast radius is one finding. When one is wrong
you throw away 100 lines, not 90 files. **The total work is the same; the risk
per unit and the verifiability per unit are what change — and those are the two
things that were broken.**

## "No security" is the real starting line

This is a one-developer project with **no** security today. So the bar the theory
aims at is not "genius-model-certified." It is: *we scanned it, we know what we
found, we fixed what we found, and the ledger shows the date, the model, and the
commit.* That is already infinitely more than "no security" — and the ledger is
what makes the claim **checkable instead of a vibe.** The theory's job is to get
a never-hardened codebase to that bar, and then keep ratcheting it up on a
schedule. See [the-ledger/](../the-ledger/README.md) for the ratchet.
