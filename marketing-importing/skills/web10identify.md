# web10identify

**Registers a person**: maps an Instagram handle to a web10 username in the
repo, so every other command knows who "adam malev" is on each side. No
credentials, no accounts, no content — it only writes `people/<key>.json`.

## When the operator says

- "identify <name>" / "who is <name> on web10" / "add <name> to the registry"
- A loose name is fine: `web10identify adam malev` → resolve finds the closest
  identified person.

## Steps (agent)

1. **Resolve first.** Run:
   ```
   node marketing-importing/scripts/identify.mjs resolve "adam malev"
   ```
   - `RESOLVED: <key>` (exit 0) → the person is already identified. Show the
     entry (`identify.mjs show <key>`) and stop — or go straight to whatever
     the operator actually wanted (import/sync).
   - `AMBIGUOUS` (exit 3) → show the top candidates and **ask the operator to
     confirm** which person before writing anything.
   - No close match → this is a new person: go to step 2.

2. **Gather the mapping.** Ask the operator:
   - the Instagram handle (e.g. `adammalev`)
   - the web10 username they want (e.g. `adam`)
   - the display name to use (e.g. `Adam Malev`)
   - **the permission**: who granted access to this person's content and when
     (verbatim if possible). A person with no recorded permission cannot be
     imported — `import.mjs` and `sync.mjs` refuse to run against them.

3. **Register:**
   ```
   node marketing-importing/scripts/identify.mjs add \
     --key adam_malev \
     --web10-username adam \
     --insta adammalev \
     --name "Adam Malev" \
     --permission "Profile managed by <who> with the owner's explicit permission (<date>)."
   ```
   Key convention: `first_last` in lowercase snake case.

## Output

`people/<key>.json` — the mapping:
```json
{
  "person": "adam_malev",
  "web10_username": "adam",
  "instagram_handle": "adammalev",
  "display_name": "Adam Malev",
  "website_default": "https://www.instagram.com/adammalev/",
  "permission": "...",
  "created": "09.11.2026"
}
```

## Rules

- Never store credentials here. Passwords travel as env vars per run.
- `add` refuses to overwrite an existing key without `--force`.
- The permission line is a **gate**, not a comment: without it, import and
  sync refuse to run.
