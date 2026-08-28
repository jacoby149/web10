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
    # ref_value (the target's doc_id). Discovery engagement (get_ref_counts)
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
    """

    token: str | None = None
    service: str
    doc_id: str | None = None
    groups: list[str] | None = None
    limit: int = 50
    offset: int = 0
    match: dict | None = None
    sort: PowerMeanSort | None = None


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
