# web10import

**Full first-time import** of an identified person: their web10 account
(created if it doesn't exist), their profile (name, bio, website, PFP from
the Instagram profile), and **all** their Instagram posts in
chronological order (oldest → newest).

## Preconditions

1. The person is identified (`people/<key>.json` exists, with a permission
   line — see `web10identify`).
2. The operator is present (the agent asks for credentials, step 1).

## Steps (agent)

1. **Ask the operator for the web10 credentials** (username + password for
   this person's web10 account — or the ones to use when creating it).
   Passwords are never written to the repo; they go into env vars for the
   run only.

2. **Run the import** from the repo root:
   ```
   WEB10_USERNAME=<u> WEB10_PASSWORD=<p> \
     node marketing-importing/scripts/import.mjs <key> [--limit N]
   ```
   What it does, in order:
   - scrapes the IG profile (`state/<key>/inventory.json`: name, bio, link,
     PFP URL, every post permalink, newest-first);
   - downloads the PFP;
   - logs into social.web10.app; **if the account doesn't exist, signs it up**
     (same consent flow as any new user);
   - sets the profile: display name, bio, website, PFP;
   - posts every IG post oldest→newest through the real New Post sheet:
     media attached (carousels keep all images), caption = the IG description,
     visibility public;
   - records each posted URL in `state/<key>/synced.json` **as it goes** — a
     crashed/aborted run resumes where it stopped on the next invocation.

3. **Report.** On success: total posted this run, post count on the profile,
   and the screenshots under `.context/production-run/`. On a stop: which post
   failed and why (the script says `STOPPED at <url>` and leaves it pending).

## Chunking long imports

A big profile is hours of uploads. Run in chunks and resume:
```
WEB10_USERNAME=<u> WEB10_PASSWORD=<p> node marketing-importing/scripts/import.mjs <key> --limit 20
```
re-run until it reports `All in-scope posts synced`. `--limit` is per-invocation;
state makes it safe to stop and start anywhere.

## Failure modes

- **IG rate-limiting / grid won't load** → the inventory is incomplete.
  Re-run later; already-synced posts are never re-posted (dedup is by IG
  permalink in `synced.json`).
- **One post fails (rejected media, upload stall)** → the run stops there,
  nothing is lost, next run retries that same post first (oldest-pending order).
- **HLS transcode lag** → a video post is visible immediately (poster +
  metadata); the node's server-side HLS transcode finishes seconds-to-minutes
  later. A freshly posted video not playing yet is NOT a failure.
- **Credentials wrong / account missing** → login fails cleanly with the
  auth status text; fix credentials and re-run.

## Limits (the node's, not ours)

Video ≤ 500 MB, ≤ 3 h; images ≤ 20 MB (re-encoded to ≤ 2048px by the client);
audio ≤ 50 MB. An Instagram post that exceeds these stops the run — report it
to the operator (trim/skip decision is theirs).
