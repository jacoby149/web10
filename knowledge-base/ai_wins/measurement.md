# Adding Improvements

Write what changed in a sentence a person can understand.

Good: "Fixed broken profile photos on the People page."

Not useful: "Improved cross-surface identity-resolution maturity."

## Row Format

| Date | ID | PR | Type | Changed | Human description | Source |
| --- | --- | --- | --- | --- | --- | --- |
| DD.MM.YYYY | MON-000 | #123 | fix | code, tests | Fixed broken images on posts. | Changelog version or other evidence |

The example is a format, not a real improvement.

## Rules

- Use `fix`, `feature`, `evolutionary` or `revolutionary` as defined below.
- Use `KB`, `code`, `tests`, or a combination to say what changed.
- Count substantive decisions and knowledge corrections as KB work, not every changelog line or completion tick.
- Count changed tests, not merely running the existing suite.
- Use the changelog date consistently; it is not necessarily the merge date.
- Find the actual PR in Git history; use `not recorded` if the match is unclear.
- Link the source so someone can check the sentence.
- Separate different useful improvements in one PR, but do not count each implementation step as another feature.
- Keep follow-up fixes; they show what it took to make the feature work.
- Put unsuccessful attempts in notes, not among completed improvements.
- Mark a change later removed or replaced rather than implying it is still current.
- Do not count duplicate changelog copies twice.
- Do not count writing this list as another product win.

The total says how many documented improvements we collected. It does not say
how many independent features shipped or how much cheaper development became.
We need actual effort and spending records for that. Collect what happened
without making up a success rate.

## The Four Types

| Type | Meaning | Example |
| --- | --- | --- |
| fix | Repairs something broken or incorrect. | Fixed broken images on posts. |
| feature | Adds a useful capability without fundamentally changing the system. A feature can have very high impact. | Added products, social posts or a social feed. |
| evolutionary | Substantially develops an existing backend or shared mechanism while keeping the basic system recognizable. | Added OAuth to existing auth, built the HLS pipeline, or replaced duplicated image loaders with a shared resolver. |
| revolutionary | Fundamentally changes how the whole system, backend or human-computer interface works; the new model is almost unrecognizable compared with the old one. | Replaced the database architecture, or replaced the contract/access model with roles and groups. |

Classify the actual change, not its excitement, size or business importance.
Products are a high-impact feature, not a revolution just because the app gains
a new concept. A shared component is not revolutionary because several screens
use it. Removing the last Mongo dependency after the migration is evolutionary;
the original database replacement is the revolutionary change.

Start with fix or feature. Use evolutionary only when the description can name
the substantial underlying mechanism that changed. Reserve revolutionary for a
replacement of the system's basic model, not an extension or consolidation.
A major change to how people operate the system can qualify too; ordinary UI
features and layout changes do not.

The Changed column stays separate: a revolutionary decision recorded only in
the KB is still knowledge work, not an implemented revolution. Decision and
implementation rows may describe the same change at different stages, so totals
are records, not a count of distinct system revolutions.

## Security Wins Are Separate

The general ledger starts after AI Use Theory's August introduction. The security
ledger starts with repairs produced by the later October L1-L4 campaign.
Include a security row only when it has a campaign finding, changed unsafe
behavior and failing-before/passing-after evidence. Link the repair receipt.

Do not count scans, finding reports, plans, earlier security-related development,
or tests without a repaired unsafe behavior. Keep corrective attempts under the
same repair. State source-merge and remaining verification limits separately;
never imply the L1-L4 process is complete because some repairs have landed.
