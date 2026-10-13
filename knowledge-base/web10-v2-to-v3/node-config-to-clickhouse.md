# Node Config: Mongo → ClickHouse

## The Problem

v2 stored the node's operator config in MongoDB — the `web10.config`
collection (one document: admins list, provider, JWT keys, signup gates,
integration credentials) and `web10.jwt_keys`.

v3 runs **one store: ClickHouse** (`../web10-v3/faq/olap-only.md`). The
v3 ecosystem stack has no Mongo service — but `config.py` kept reading
and writing the Mongo collections. On any stack without Mongo, every
config read blocked ~30s on a dead pymongo server-selection timeout,
then raised.

That detonated on the dev stack: `check_admin` 500'd, the auth UI's
`checkAdmin` set `isAdmin=false`, and the Node Config panel never
rendered for the node's admin. `/setup` status and `/setup/configure`
hung the same way. The e2e suite never caught it because the e2e compose
still runs FerretDB (a test-stack leftover, not a v3 service).

## The Solution

The config moves to ClickHouse — a `node_config` table (see
`../web10-v3/db/clickhouse.md`):

- `config_id='node'` — the node config JSON (admins, provider, gates,
  credentials)
- `config_id='jwt:<kid>'` — JWT signing key records

Saves append a new row; reads dedup to the latest row per `config_id`
(the house OLAP pattern). `config.py` keeps its interface and delegates
to the v3 ClickHouse service. Pre-existing volumes get the table via the
boot-time schema self-heal.

**What did NOT change:** the model. Admin-ness is still the config
`admins` list, unioned with `settings.DEFAULT_ADMINS` (the lockout-proof
baseline). The users table still has no admin flag — admin is node-global
operator config, not a user attribute. The setup flow is the same shape
(status → configure → login), just with ClickHouse under it.

Full v3 model: `../web10-v3/setup/node-config.md`. Decision: D48.
