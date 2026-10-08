from pydantic import BaseModel


class AdPreference(BaseModel):
    """A document's ad preference (ads-dissemination.md, v3).

    `mode` is `none` (no ad) or `pinned` (a specific ad, by `target` doc_id).
    The read serves a pinned doc with its ad inline, I3-checked. v4 grows this
    to a curation engine (catalog + signal × strategy + scope).
    """

    mode: str = "none"
    target: str | None = None


class CreateDocument(BaseModel):
    """Create a document in a service. User from JWT. Server generates doc_id."""

    token: str
    service: str
    body: dict
    groups: list[str] | None = None
    # The ref pattern: a reaction/comment points at its target post via
    # ref_value (the target's doc_id). Discovery engagement (read_ref_counts_by_ref)
    # and the social app's reaction/comment reads both key off this column.
    ref_value: str | None = None
    # The v3 ad preference (pinned | none). Stored in the ad_mode/ad_target
    # columns; the read serves a pinned doc with its ad inline.
    ad_preference: AdPreference | None = None


class PowerMeanSort(BaseModel):
    """Power-mean ranking config (the feed knobs, server-side).

    The same knobs the marketing /trending knob rack and the social app's
    DiscoverScreen hold client-side (marketing-ui/src/lib/powerMean.ts), sent
    to the node so ClickHouse does the ranking and returns pre-sorted results.
    Weights are 0..1 (0 = that signal is ignored); half_life_ms is the recency
    decay half-life (0 = all time, no decay); character is the power-mean
    exponent p (negative = strict, 0 = geometric, positive = loose).
    """

    recency: float = 0.0
    likes: float = 0.0
    comments: float = 0.0
    half_life_ms: float = 0.0
    character: float = -1.0


class ReadDocuments(BaseModel):
    """Read documents. doc_id for single read, groups for discover, 'me' for own docs.

    `token` is optional: a missing token reads as the node's `anon` member,
    which is what makes the discover group (the public board) anon-readable
    through the normal group-read path. Discovery IS a group read in v3 —
    there is no separate discover endpoint.

    `sort` (optional): a power-mean ranking config. When present, the read is
    ranked by the feed knobs over the full group membership and returned
    pre-sorted (the discover board's "your algorithm" — D36).

    `tags` (optional): a generic server-side tag filter — return only docs
    that carry EVERY given tag (``has(tags, …)``, the idiom the node-ad read
    already uses). A platform primitive, not a social concept: any service's
    read can filter by its own tags. The Shorts feed is the first consumer
    (``["short"]``); the render-time gate on the client stays the backstop.
    """

    token: str | None = None
    service: str
    doc_id: str | None = None
    groups: list[str] | None = None
    limit: int = 50
    offset: int = 0
    match: dict | None = None
    sort: PowerMeanSort | None = None
    tags: list[str] | None = None
    # The ref filter (the flexible read, phase 1): return only the docs whose
    # ref_value matches. A single doc_id or a list (the engagement-count shape:
    # "give me the comments/reactions for these posts"). Routed through the
    # safe-query engine (build_safe_query) so it carries the full boundary —
    # group filter + block/sharing/hidden — not just a raw WHERE.
    ref: str | list[str] | None = None
    # With `ref`, return a {ref_value: count} map instead of the docs — the
    # server-side engagement-count shape (GROUP BY ref_value through the
    # engine). Exact for the caller's readable groups, no cap.
    count: bool = False
    # Cursor paging for the ref read (the comment thread, comments.md): a
    # keyset cursor — the `created_at`/`doc_id` of the last row of the
    # previous page, encoded by the caller. The server orders by
    # `created_at` (tie-broken by `doc_id`) and returns the next page after
    # the cursor. Absent = the first page.
    cursor: str | None = None
    # Page order for the ref read: "asc" (oldest first — the thread's
    # "most recent" reading order) or "desc" (newest first). Default "asc".
    order: str = "asc"
    # The surface label the app shows the content on (D86): "feed" / "shorts" /
    # "discover" / "profile" / "group" for web10-social; "list" / "detail" for a
    # notes app. The node records it verbatim on the delivery impression — it
    # does not know what the label means (D60: the app owns the surface). When
    # present + the reader is verified, the read path logs a delivery
    # impression per returned doc (the server-side, un-gameable floor). Absent
    # = no delivery logged (the read is not a "view" the app is measuring).
    surface: str | None = None


class UpdateDocument(BaseModel):
    """Update a document. Body is merged. Groups replaced if provided."""

    token: str
    doc_id: str
    body: dict
    groups: list[str] | None = None
    # The v3 ad preference (pinned | none). If omitted, the existing
    # ad_mode/ad_target are preserved (the update passes them through).
    ad_preference: AdPreference | None = None


class DeleteDocument(BaseModel):
    """Delete (tombstone) a document."""

    token: str
    doc_id: str


class TrackContentEvent(BaseModel):
    """Record a client-reported content event (D86): a `viewport` (the reader
    saw the doc for Ns / M%), a `click` (a CTA tapped), or an app-defined type.

    Gated on a preceding delivery (the node must have served this doc to this
    reader on this surface) + deduped per (doc, reader, surface, type) per
    window — so a reader cannot report on a doc they were never shown, and a
    re-report within the window is a no-op (D86 anti-gaming). Anon is dropped
    (only a verified reader is counted). The `payload` is a JSON string the app
    fills (e.g. `{"watched_ms": 12000, "duration_ms": 60000}`) — the node
    stores it verbatim, content-free (D60: the app owns the payload's meaning).
    """

    token: str
    doc_id: str
    service: str
    surface: str
    type: str
    payload: str = ""


class ContentAnalyticsRequest(BaseModel):
    """The creator's own content metrics (D86) — the dashboard's data source.

    I3-bound by construction: the aggregate is scoped to docs the caller
    **authored** (``documents.author_key = reader``), so a creator can only
    ever see their own content's events — never another creator's. ``service``
    is the content service (``posts`` for web10-social; a notes app's notes
    service, a shop's products service — D60-generic). ``window_days`` is the
    trailing window (default 30). Returns one row per (doc, surface, day); the
    client aggregates up to totals / per-surface / time-series / per-doc.
    """

    token: str
    service: str
    window_days: int = 30


class ContentViewsRequest(BaseModel):
    """The on-surface view metrics (D86): impressions (total delivery events) +
    reach (distinct readers) per doc, read by the VIEWER for docs they can read.

    I3-scoped: a doc only returns metrics if it is in one of the reader's
    readable groups for the service (the ``doc_groups`` join) — a reader sees a
    post's metrics only if they can read that post. The counts themselves are
    global; the group filter limits WHICH docs the reader can query, not the
    count. No window filter — the on-surface number is a lifetime count (bounded
    by the table's 1-year TTL). This is the SAME object the D86 engine records
    (the delivery impression), so the on-surface number and the dashboard are
    one source of truth.
    """

    token: str | None = None
    service: str
    doc_ids: list[str]
    groups: list[str]
