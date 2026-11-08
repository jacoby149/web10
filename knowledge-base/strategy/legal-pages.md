# Marketing legal pages — server ads and privacy

## Scope

Operator request, 06.11.2026: add a hosted-only server-ad reservation to
`marketing/marketing-ui/public/docs/terms.md`, reconcile its two exclusive
creator-sponsor promises, and add `/docs/privacy` with docs navigation and
Privacy beside Terms in the Home, Join and Freedom footers. No percentage
or revenue split is a term. The existing ownership section stays unchanged.
No other public document or runtime data practice changes.

Operator correction, 06.11.2026: the former copyright inbox does not exist.
Use `jacob@web10.app` for copyright/takedown requests in both legal pages
and the social app's Report copyright dialog; keep D81 and the moderation
contract aligned. This follow-up also owns that dialog's recipient constant
and focused test, not its layout or workflow.

The voice is the existing Terms' plain-language, declarative voice; this is
a surgical touch-up plus a new summary, not a rewrite of the legal model.

## Privacy claim trace

| Claim | Source |
| --- | --- |
| Reference-node/social scope; self-hosted nodes set their terms | Terms introduction |
| Owned collection; stateless apps; scoped/expiring tokens; export; app revocation | Terms: Your data is yours |
| Node-readable; discovery/search/auditability; terms-controlled access; no default E2E; PWA | Terms: The node is readable by design; `thesis.md` |
| GA4/Hotjar; masked text/blocked images; content-free events; content not sold or fed to ads | Terms: Telemetry; `web10-v3/telemetry.md`; each app's `src/lib/analytics.ts` |
| Marketing first-party usage/error reports and their metadata | `marketing/marketing-ui/src/lib/analytics.ts`: `trackPageview`, `trackFunnel`, `reportError` |
| Hosted-only ads; removal ends that right; no rights to posts | Operator's explicit request and new Terms: Server ads |
| Copyright address and self-hosted-agent scope | Operator correction, 06.11.2026; Terms: Copyright & DMCA |
| Privacy address | Operator-supplied draft; Jacob's existing contact in `research/fifth-draft/main.tex` |

This traces the statements to existing policy/code; it is not an independent
telemetry audit or a legal-completeness certification.

## Jacob's review gate — before publication

- Approve the legal text and confirm `jacob@web10.app` is the intended
  privacy inbox, not merely an existing author contact.
- Confirm the policy's scope, including marketing/authenticator surfaces.
- Supply any required controller identity/address, jurisdictions, lawful
  bases, cookie/identifier details and consent requirements, processor and
  international-transfer terms, retention/backup/deletion timing, privacy
  rights/request process, children's policy and effective date. None is
  invented in the public draft.
- The draft also discloses existing first-party pageview/funnel/error beacons
  (`marketing-ui/src/lib/analytics.ts`: path, referrer, browser metadata and
  error reports). Review the complete disclosure; this draft is not a full
  personal-data inventory.
- Older internal D56/thesis wording still describes creator-only sponsors;
  this narrow request changes the two Terms sentences only. Server-ad
  implementation already exists; this is not an ad-engine change.
- Local browser evidence cannot confirm production publication. After
  approval and normal deployment, verify both `https://web10.app/docs/terms`
  and `https://web10.app/docs/privacy` and their navigation/footer links.
