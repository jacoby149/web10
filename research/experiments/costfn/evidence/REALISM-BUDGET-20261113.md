# Keep validation bounded without throwing away the dataset

The operator requested “make the budget higher please, like $40 or something!”
after confirming the data volume must survive compute cleanup. This authorizes
$40 total compute on the existing host, not a new host or a storage deletion.

## Applied state

- Droplet: `618505005`; rate: $0.25/hour.
- Retained 400-GiB volume: `d01c584d-de97-11f1-8944-c234aeb68f7e`.
- Prior cleanup: 13 November 06:50:22 UTC.
- Replacement cleanup: **14 November 04:38:02 UTC** (24-hour recovery window).
- Independent watchdog source updated before its lease; replacement host-stop
  timer read back as `Sat 2026-11-14 04:38:02 UTC` before the old timer stopped.
- Exact volume/account/attachment checks passed after application. No volume
  deletion, new host, resize, upload or validation restart occurred.

The lease requires the existing initial fourteen-hour approval and four-hour
extension, an approval timestamp before the previous deadline, exactly $40 and
$0.25/hour. Maximum total lifetime is 160 hours from original creation; the
applied window is shorter. This is not a provider-enforced billing cap. Storage
is separately billed; retaining the only dataset copy remains intentional.

## DigitalOcean regression receipt

Tests ran in isolated `/mnt/costfn-work/budget-40usd-controls-_9lq_hc1`, with
mocked provider calls: no resources were created or deleted by the tests.
The same tests return 1 against predecessor lease source and 0 against updated
source: **16 tests, OK**. Controls cover approval history/rate/budget/clock,
the 160h total bound, closed/expired admission and cleanup never calling a
volume API. Logs remain there as `before.log` and `after.log`; the local
transport receipt is `.context/budget-40usd-controls.json`.

Validation restart and reconciliation of its worker/query deadlines remain OPEN.
The data volume is not temporary scratch to discard when compute ends.
