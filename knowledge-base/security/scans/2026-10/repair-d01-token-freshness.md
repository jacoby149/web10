# D-01 Token Freshness Repair

27.10.2026. Baseline `c6f9cc85dad79dc8b7d2b621940adc8bb121bf0d` (#1268 merged).
Author/fresh reviewer: separate OpenCode `openrouter/openai/gpt-6.1-sol` contexts,
same-model, not model-diverse three-dry sign-off. Source repair verified locally;
merged #1271 at `b828736b4`; deployment/diverse sign-off not established. Overall L1 OPEN.

## One Root, Three Observations

L1-D-01 allowed expired signed claims to become trusted principals. L1-OAUTH-01
is its OAuth authorize occurrence: code issuance checked signature, not custom
expiry. L1-D-02's oracle also treated missing/malformed expiry as valid. These
share one freshness contract; they are not a signature-algorithm/issuer repair.

`decode_token(..., private_key=True)` now checks required custom ISO `expires`
for non-anonymous tokens after signature verification. Missing, wrong-type or
unparseable expiry raises a fixed InvalidTokenError; deadline <= UTC now raises
ExpiredSignatureError. Node-minted naive times mean UTC; offsets denote absolute
instants. PyJWT independently enforces standard `exp`; it cannot substitute for
custom `expires`. The same helper is retained in certify, preserving its explicit
gate even for independently supplied/mocked decoded data. The oracle uses these
typed failures rather than a second fail-open parser.

Signed anonymous tokens keep the existing custom-expiry exemption; tokenless
public reads stay anonymous. Standard `exp` still applies to signed anonymous
tokens. Explicit unsigned metadata decoding is unchanged and grants no new
authority. No provider/purpose/client-revocation policy, lifetime, key, token
format, group grant, app-contract rule or SDK/UI flow is redesigned.

## Caller Inventory

Reviewed every production decode call: principal helpers (`user`, `user_or_anon`,
`client_id_of`), OAuth authorize, recovery-phone mutation, app-store rating,
group creation's provider-derived ID, certification/admin checks, analytics
`_verified_username`, and the access oracle. They establish authority or trusted
attribution; none requires expired verified claims for metadata-only operation.
Remote-provider routing and optional system bug-report attribution use unsigned
metadata decoding and remain separate open trust-boundary work. No undiscovered
caller, deployed consumer or whole-call-graph assurance is claimed.

## Repro And Controls

Initial 49 real-JWT cases: **48 fail before repair, one expired-naive oracle
control already passes**. Thirty principal/delegation helper cases return values
when they should reject; nine HTTP cases reach email, phone or OAuth-code sinks
under stale/missing/malformed expiry; remaining failures cover oracle acceptance.
After repair, all deny authority before the inert store sinks. No real DB writes,
codes or account takeover demonstrated. All signing keys/claims are synthetic.

Final focused suite: **92 passed**. It includes valid HTTP mutations/code minting,
profile-read denial, valid naive/UTC/offset credentials, 15 deadline controls
(-1us/equality/+1us across -12/-07/UTC/+05:30/+14), malformed anonymous exemption,
unsigned metadata preservation, wrong signatures, independent standard expiry,
delegation-marker/active-client preservation and expired-visit attribution.
Original compiled queries and permission/contract semantics are not changed.

`uv run --frozen pytest -q --disable-warnings --tb=short`: **1,325 passed, four
subtests passed**. Ruff check/format and whitespace checks pass. Independent
review loaded baseline auth/oracle source in memory and replayed initial/current
tests plus 29 extra assertions. It found no remaining source blocker after the
offset/boundary/format controls were made durable. Its follow-up reran the 92
focused cases; the full 1,325 result is the author's recorded run.

## DESIGN-INTENT REVIEW

- Intent: expiring user credentials must be fresh before trusted principals, protected operations or session-health success; anonymous access remains bounded as before.
- Delta: expired or ambiguous user sessions now reject consistently, while offset-bearing valid ISO times work and exact equality is expired.
- By-design conflict: none found with custom ISO expiry, anonymous exemption, unsigned metadata inspection, body tokens, D41 or D56.
- Conventional deviation: the intentional custom `expires` format remains; no numeric-exp migration, new lifetime or issuer rollout is introduced.
- Limits: real signatures and HTTP routes over inert stores; not browser/PWA recovery UX, deployed consumers, live DBs, issuer trust or model-diverse convergence.

Accepted for this bounded local repair, 27.10.2026: external/legacy signed user
tokens lacking parseable custom expiry must reauthenticate; exact deadlines have
no clock-skew grace. Node minters supply custom expiry, so immortal/ambiguous user
sessions would contradict the contract. Reopen on a supported issuer's incompatible
format, measured premature expiry, or deployed reauth loops/lost destinations;
resolve issuer compatibility, clock policy or recovery behavior explicitly, not
by restoring fail-open expiry. No operational rollout approval is implied.

HS256/default keys, provider binding, credential purpose, delegation/revocation,
popup binding, manifest fetching, storage/schema/concurrency and artifact evidence
remain separate open obligations. This repair and same-model review cannot close
the protocol L1 gate or satisfy required independent model-diverse sign-off.
