# Name the interface, not a mysterious line

Jacob Hoffman, 19 November 2026. Write the two sides in a complete sentence
whenever describing an authority or representation boundary. Do not make the
reader decode an adjective such as “wire,” “trust” or “canonical” to discover
which systems are meant.

Use the actual exchange:

- **At the app -> API boundary,** the API verifies submitted credentials and
  app permissions. JSON request parsing happens here, not inside ClickHouse.
- **At the API -> ClickHouse boundary,** the API supplies authorized SQL. A
  generated access-filtered CTE is a mechanism, not an unnamed location.
- **At the ClickHouse -> API boundary,** typed result rows return for assembly.
- **At the API -> app/UI boundary,** the API serializes its assembled response.
  D118 (DECIDED) separates this response shape from physical storage.
- **At the API -> object-storage signer boundary,** canonical read authority
  must determine which object can receive a capability. Projected owner/body
  columns do not grant that authority.
- **At the preview service -> remote HTTP origin boundary,** destination/redirect
  checks prevent SSRF. Browser CORS does not replace those checks.
- **At the reader app -> serving-node API boundary,** the serving node authorizes
  content. **At the serving-node API -> home-node API boundary,** certification
  verifies a foreign token; it is not a content grant or cross-database access.
- **At the browser page -> PostHog capture boundary,** the telemetry allowlist and
  sensitive-region rules govern what leaves the app. They are not proof of human
  viewing or payout eligibility.

For non-interface meanings, use the actual noun: calendar cutoff, first/last
carousel item, token delimiter, pagination cursor, rendering error handler or
admitted scope. A generic label is not clearer just because it sounds technical.

This is a writing rule, not a changed runtime contract. Keep code identifiers,
literal operator quotations, immutable scan records and banked receipts intact;
the tightening audit lists those occurrences instead of editing their history.
