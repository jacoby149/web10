# web10accountsync

**Incremental sync**: check the Instagram profile for new posts, and post only
what's new to the person's web10 account. This is the "keep it current"
command — run it whenever the operator says the profile has new content.

## Preconditions

- The person is identified AND already imported (the web10 account exists,
  `state/<key>/synced.json` has entries). If not: run `web10import` first.
- The operator is present (step 1 asks for credentials).

## Steps (agent)

1. **Ask the operator for the web10 username + password** for this person's
   account. Env vars only, per run — nothing secret in the repo.

2. **Run the sync** from the repo root:
   ```
   WEB10_USERNAME=<u> WEB10_PASSWORD=<p> \
     node marketing-importing/scripts/sync.mjs <key> [--limit N] [--dry]
   ```
   - It **re-scrapes the IG profile fresh** (the IG side moves; never trust a
     stale inventory),
   - diffs the post list against `state/<key>/synced.json`,
   - `--dry`: prints what would be posted and stops (safe default for a first
     look),
   - otherwise logs in once and posts the new posts oldest→newest, recording
     each into `synced.json` as it goes.

3. **Report**: `N new post(s) synced` or `all caught up`. If it stopped
   mid-run, say which post and why; the next sync resumes automatically.

## Semantics

- **New = not in `synced.json`.** Posts deleted on Instagram stay synced (we
  don't mirror deletions — ask the operator if removal is wanted).
- **Ordering** among the new posts is chronological (oldest first), so the
  feed reads in the right sequence.
- **Dedup is by Instagram permalink.** The same post can never be posted
  twice.
- The web10 account must already exist — sync has no signup fallback, on
  purpose (a "sync" that creates accounts hides mistakes).
