1.0.14 || 16.07.2026
unit test infrastructure:
  - api: added pytest suite (118 tests) covering mongo.py transformations
    (q_t, u_t, to_gui, to_db, star_found, get_approved, is_in_cross_origins),
    main.py auth logic (kosher, can_mint, certify, decode_token, is_permitted),
    models.py pydantic schemas, and web10records.py factories
  - auth2: added vitest + @testing-library suite (config, contractInterface,
    mockInterface, mocks) with jsdom environment and setup file
  - sdk: added vitest suite (48 tests) covering wapiInit (token management,
    CRUD guards & HTTP calls, peerID, authListen, SMR, P2P init, dev pay)
    and wapiAuthInit (login, signup, changePass/Phone, send/verify code,
    Stripe mgmt endpoints, SMRListen, sendToken, mintOAuthToken)
  - review fixes: gitignored api/*.egg-info build artifacts, removed a
    broken/unused conftest fixture and an ineffective import.meta stub,
    tightened a tautological is_permitted assertion, moved
    @testing-library/dom to auth2 devDependencies
  - scope note: this is the UNIT layer only (mocked DB, no HTTP).
    outstanding endpoint-level tests (FastAPI routes, star protection,
    metering, twilio/stripe) are itemized in plan.txt "testing:"

1.0.13 || 14.07.2026
phase 0 typescript migration:
  - renamed all 34 .jsx files to .tsx (React) or .ts (non-React)
  - added global.d.ts for Window.I augmentation
  - fixed dynamic object pattern with Record<string, any> type assertions
  - fixed document.getElementById casts to HTMLInputElement
  - fixed .toFixed().toLocaleString() type error
  - updated index.html entry point to main.tsx

1.0.12 || 14.07.2026
phase 0 auth2 toolchain modernization:
  - migrated auth2 from create-react-app to vite 6 + bun (index.html entry,
    src/main.jsx, vite.config.js, bun.lock; removed react-scripts + package-lock.json)
  - react 18 -> 19; renamed all components .js -> .jsx; vitest replaces jest
  - removed react-inject-env + web-vitals; package renamed auth2 -> web10-ui
  - gitignored auth2/dist/ build output

1.0.11 || 14.07.2026
phase 0 python toolchain modernization:
  - switch to uv for package management (pyproject.toml, uv.lock, removed Pipfile + requirements.txt)
  - python 3.12, fastapi 0.139, pydantic v2, PyJWT 2.13, stripe 15, twilio 9, gunicorn 26, uvicorn 0.51
  - pydantic v2 migration: .dict() -> .model_dump(), Optional[X] -> X | None, ConfigDict(extra="allow") on Token model
  - removed infisical dependency (pyinfisical.py, settings.py integration) — env vars only for secrets
  - pruned dead deps: python-ldap, python-gnupg, systematic, future, secrets (pypi)
  - Dockerfile: slim python3.12 image with uv (no pipenv, no nodejs base, no apt libsasl/libldap)
  - added ruff for lint+format (pyproject.toml config, legacy style issues excluded for now)

1.0.10 || 14.07.2026
added plan.txt : phased roadmap (0-12) — toolchain modernization, documentdb/
  ferretdb switch, unified ui + setup wizard, creator admin panel + analytics,
  media/s3 layer, wapi.js + aggregate verb + mcp, killer social app (first-party,
  in-repo) + the lens chatbox, social exporters, user backups, e2e encryption,
  trust & safety. plus cross-cutting quality/testing/security and milestones M0-M3.
added parallel execution.txt : 4-lane plan for running Conductor workspaces in
  parallel without merge conflicts (lane ownership + wave-0 test seatbelt).
added CLAUDE.md, GLOSSARY.md, decisions.md : agent onboarding + shared context.
documented a CONFIRMED federation security bug : providers don't cryptographically
  validate each other (HS256 symmetric signing) — fix is HS256 -> RS256/EdDSA + JWKS.
established five end-to-end security invariants (I1-I5) enforced by the test suite.

1.0.9
added infisical secrets management.
added pipenv for api python package management.
made the settings.py file have defaults.
made configs managed by .env file.
made CORS_SERVICE_MANAGERS from list to comma sep. strings.
made COST dict env var type multiple env vars.
some use case presentations in the sdk folder.

1.0.8 || 11.10.2023
Made the CHANGELOG
Any time there is an improvement / change to the project, that improvement /
change will go here
1.0.8 is the most recent release!
I don't even remember what I improved from 1.0.7.
That is the exact reason why it is beneficial to have a changelog.
