import logging

from fastapi import APIRouter, HTTPException, Request

import app.exceptions as exceptions
from app.services.hls import hls_prefix, mint_sig
from app.v3.endpoints.auth_helper import client_id_of, principal, user_or_anon
from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import (
    ContentAnalyticsRequest,
    ContentViewsRequest,
    CreateDocument,
    DeleteDocument,
    ReadDocuments,
    TrackContentEvent,
    UpdateDocument,
)
from app.v3.models.documents import DocumentAttachment
from app.v3.services import clickhouse as ch
from app.v3.services import moderation

router = APIRouter(tags=["documents"])
log = logging.getLogger(__name__)


def _log_deliveries(docs: list[dict], reader: str, service: str, surface: str | None) -> None:
    """Log a delivery impression per returned doc (D86, the read path's side
    effect — the server-side, un-gameable floor). Only when the app passed a
    `surface` label AND the reader is verified (anon is dropped). Best-effort:
    a metrics failure never fails the read. Count/ref reads do NOT call this
    (a count query is not a content view)."""
    if not surface or reader == "anon" or not docs:
        return
    ch.log_content_deliveries([d["doc_id"] for d in docs], service, reader, surface)


def _moderate_post(author: str, doc_id: str, service: str, body: dict, groups: list[str]) -> None:
    """Content moderation (D59) — the post-create hook.

    Only posts attached to the discover board are moderated. A post by a user
    on ``auto_hide_users`` is always auto-hidden; a post whose text trips the
    blocklist is auto-hidden when ``auto_moderate`` is on (otherwise flagged
    only). Every hit records a flag for the operator's review queue. The hide
    uses the existing ``group_hidden_docs`` mechanism — the author's own copy
    is untouched (I3). Best-effort: a moderation failure never fails the post.
    """
    if service != "posts" or ch.DISCOVER_GROUP_ID not in (groups or []):
        return
    try:
        cfg = moderation.moderation_config()
        if not cfg["moderation_enabled"]:
            return
        text = body.get("text", "") if isinstance(body, dict) else ""
        reasons = moderation.should_auto_hide(author, text, cfg)
        if not reasons:
            return
        moderation.record_flag(author, doc_id, reasons)
        is_listed = "auto_hide_users" in reasons
        if is_listed or cfg["auto_moderate"]:
            ch.hide_doc_from_group(ch.DISCOVER_GROUP_ID, doc_id, moderation.NODE_MODERATOR)
            log.info("[moderation] auto-hidden doc=%s author=%s reasons=%s", doc_id, author, reasons)
    except Exception as e:
        log.warning("[moderation] auto-hide failed (non-fatal): %s: %s", type(e).__name__, e)


def _mint_ref_manifest(ref, reader_key: str, media_owner: str, authenticated: bool = False) -> dict:
    """Mint a `manifest_url` into a resolved media ref that carries HLS
    settings — the feed path, where the post's media_refs carry the media
    doc's transcoding_settings (resolve_media_urls carries them) and the sig
    is minted for the READER (cross-user: a follower streams the creator's
    video; the manifest endpoint re-checks access on every fetch).

    The prefix binds to the ref's object_key — for media_metadata/public_media
    docs that IS the raw video file's key (the flat shape the social app's
    uploadMedia writes), so it matches the worker's hls_prefix. The resolved
    key must belong to the same uploader context used by media resolution.
    """
    if not isinstance(ref, dict):
        return ref
    ts = ref.get("transcoding_settings")
    if not isinstance(ts, dict):
        return ref
    ts = {k: v for k, v in ts.items() if k != "manifest_url"}
    ref = {**ref, "transcoding_settings": ts}
    if not ts.get("enabled"):
        return ref
    doc_id = ref.get("doc_id")
    object_key = ref.get("object_key")
    if (
        not isinstance(doc_id, str)
        or not doc_id
        or not isinstance(media_owner, str)
        or not media_owner
        or not isinstance(object_key, str)
        or not object_key.startswith(media_owner + "/")
        or len(object_key) <= len(media_owner) + 1
    ):
        log.info("[media] reference HLS mint: denied invalid owner or key")
        return ref
    log.info("[media] reference HLS mint: started")
    sig = mint_sig(reader_key, doc_id, hls_prefix(object_key), authenticated)
    log.info("[media] reference HLS mint: completed")
    return {
        **ref,
        "transcoding_settings": {
            **ts,
            "manifest_url": f"/v3/media/hls/manifest?doc_id={doc_id}&sig={sig}",
        },
    }


def _mint_hls_manifest_urls(docs: list[dict], reader_key: str, authenticated: bool = False) -> list[dict]:
    """Inject `transcoding_settings.manifest_url` into transcoded media.

    Two sites: (1) the doc itself — a direct read of a media doc whose body
    carries `video` + `transcoding_settings` (the media demo's poll path);
    (2) the doc's resolved media_refs — the feed path, where a post's
    media_refs carry the media doc's transcoding_settings and the sig is
    minted for the reader.

    The sig is bound to (reader, doc, hls prefix) with a 10-minute TTL — the
    expiry is the group-membership re-check cadence (minio-auth-bifurcated).
    `authenticated` (the reader held a valid token at read time) rides in the
    sig so the manifest re-check evaluates the same D58 principal classes the
    read did. A path-only URL: the client prepends its API origin.
    """
    out = []
    for doc in docs:
        body = doc.get("body") or {}
        doc = dict(doc)
        body = dict(body)
        # (1) the doc itself (a media doc read directly)
        ts = body.get("transcoding_settings") or {}
        video = body.get("video")
        if isinstance(ts, dict) and ts:
            # Stored URLs are not authority; only this read may mint a fresh one.
            ts = {k: v for k, v in ts.items() if k != "manifest_url"}
            body["transcoding_settings"] = ts
            if ts.get("enabled"):
                owner = doc.get("posted_by") or doc.get("author_key")
                key = video.get("value") if isinstance(video, dict) else None
                if (
                    isinstance(video, dict)
                    and video.get("type") == "minio"
                    and isinstance(owner, str)
                    and owner
                    and isinstance(key, str)
                    and key.startswith(owner + "/")
                    and len(key) > len(owner) + 1
                ):
                    log.info("[media] direct HLS mint: started")
                    sig = mint_sig(reader_key, doc["doc_id"], hls_prefix(key), authenticated)
                    ts["manifest_url"] = f"/v3/media/hls/manifest?doc_id={doc['doc_id']}&sig={sig}"
                    log.info("[media] direct HLS mint: completed")
                else:
                    log.info("[media] direct HLS mint: denied invalid owner or video key")
        # (2) the resolved media_refs (the feed path)
        refs = body.get("media_refs")
        if isinstance(refs, list) and any(
            isinstance(r, dict) and isinstance(r.get("transcoding_settings"), dict) for r in refs
        ):
            owner = doc.get("posted_by") or doc.get("author_key")
            body["media_refs"] = [_mint_ref_manifest(r, reader_key, owner, authenticated) for r in refs]
        doc["body"] = body
        # (2) the inline ads too — their media_refs are resolved the same way
        for ad_key in ("ad", "node_ad"):
            ad = doc.get(ad_key)
            if not isinstance(ad, dict):
                continue
            ad_body = ad.get("body") or {}
            ad_refs = ad_body.get("media_refs")
            if isinstance(ad_refs, list) and any(
                isinstance(r, dict) and isinstance(r.get("transcoding_settings"), dict) for r in ad_refs
            ):
                ad = dict(ad)
                ad_body = dict(ad_body)
                owner = ad.get("posted_by") or ad.get("author_key")
                ad_body["media_refs"] = [_mint_ref_manifest(r, reader_key, owner, authenticated) for r in ad_refs]
                ad["body"] = ad_body
                doc[ad_key] = ad
        out.append(doc)
    return out


def _check_app_permission(
    request: Request, user_key: str, service: str, operation: str, client_id: str | None = None
) -> None:
    """Enforce app contract permissions. Raises 403 if no valid contract.

    Origin→client_id re-keying (D92, O3): a delegated token (client_id present)
    is ALWAYS gated on its client_id contract — even with no Origin header (the
    AI assistant has no Origin). A browser token (no client_id) keeps today's
    path: Origin-gated when an Origin is present, skipped when absent
    (same-origin / direct call).
    """
    if client_id:
        if not ch.has_permission(user_key, "", service, operation, client_id=client_id):
            raise HTTPException(
                status_code=403,
                detail=f"No app contract for {client_id} to {operation} on {service}",
            )
        return
    origin = request.headers.get("origin", "")
    if not origin:
        return  # same-origin or direct API call — skip contract check
    if not ch.has_permission(user_key, origin, service, operation):
        raise HTTPException(
            status_code=403,
            detail=f"No app contract for {origin} to {operation} on {service}",
        )


@router.post("/create")
def create_document(request: Request, data: CreateDocument):
    """Create a document in a service. User from JWT. Server generates doc_id.

    Group-as-author: when ``author_as`` is set, the doc's ``author_key`` is
    the group_id and ``posted_by`` is the JWT username. Two gates:
    (1) the caller holds a role in the group that grants ``create`` on the
    service; (2) external targets require ``can_write_group`` as the group.
    The live grant in (1) also permits an explicit self-target attachment.
    """
    real_author = _user(data)
    display_author = data.author_as or real_author

    if data.author_as:
        # Gate 1: the caller can act as this group. The caller must hold a
        # role in author_as that grants `create` on the service.
        if not ch.get_group(data.author_as):
            raise HTTPException(status_code=404, detail="group not found")
        perms = ch.effective_role_perms(data.author_as, real_author, authenticated=True)
        if not ch._effective_allows(perms, data.service, "create"):
            raise HTTPException(
                status_code=403,
                detail="no permission to post as this group",
            )

    # App-contract gate: runs on the REAL author (the token holder), not the
    # display author. The contract is the app's trust in the USER, not the group.
    _check_app_permission(request, real_author, data.service, "create", client_id_of(data))

    # Gate 1 already authorizes this service in the acting group itself;
    # no self-membership row is needed. Never inherit human external grants.
    writable = [
        g
        for g in data.groups or []
        if (data.author_as and g == data.author_as) or ch.can_write_group(g, display_author, data.service)
    ]
    log.info("[documents] create target authorization: requested=%d writable=%d", len(data.groups or []), len(writable))
    if data.groups and not writable:
        raise HTTPException(status_code=403, detail="no write access to the requested group")

    result = ch.insert_document(
        author_key=display_author,
        service=data.service,
        body=data.body,
        ref_value=data.ref_value or "",
        tags=data.body.get("tags", []),
        ad_mode=data.ad_preference.mode if data.ad_preference else "none",
        ad_target=(data.ad_preference.target or "") if data.ad_preference else "",
        posted_by=real_author,
    )
    doc_id = result["doc_id"]

    if data.groups:
        # D58 write gate (closes the attach hole): the DISPLAY author (the
        # group, or the user) may only attach the doc to groups their effective
        # role grants `create` on this service. A bystander with no write grant
        # to any requested group gets a 403; non-writable groups are dropped
        # from the attachment.
        ch.attach_doc_to_groups(doc_id, writable)
        result["groups"] = writable
        # Moderation: check the REAL author (the human), not the group.
        _moderate_post(real_author, doc_id, data.service, data.body, writable)

    return result


@router.post("/read")
def read_documents(request: Request, data: ReadDocuments):
    """Read documents. doc_id for single read, groups for discover, 'me' for own docs.

    Anon-capable: a missing token reads as the node's `anon` member. This is
    what makes the discover group (the public board) readable without a token
    — discovery IS a group read in v3, so the board is just the discover group
    in the `groups` list. Anon's access stays bounded by group membership (I3).
    The app-contract gate applies to real users only; the public board is
    anon-readable by design (D41: the node is readable by design).
    """
    reader = user_or_anon(data)
    # D58: reads are role-gated. `authenticated` = the reader holds a valid
    # token (a real user, not anon) — it selects the `authenticated` principal
    # class in the effective-role union.
    authenticated = reader != "anon"
    # D84: foreign readers use a provider-qualified key at every downstream
    # gate; local keys stay aligned with the existing membership writers.
    reader_principal = principal(data) if authenticated else "anon"
    reader = reader_principal
    if authenticated:
        _check_app_permission(request, reader, data.service, "readAll", client_id_of(data))

    if data.doc_id:
        doc = ch.read_document_by_id(data.doc_id, reader_principal, data.service, authenticated)
        if not doc:
            raise exceptions.ENTRY_NOT_FOUND
        # Return only readable carriers; a public document must not enumerate
        # private groups it is also attached to. Actions can retain this scope.
        doc["groups"] = ch.readable_groups(
            reader_principal, data.service, authenticated, ch.get_doc_groups(data.doc_id)
        )
        # D86: a single-doc read is a content view (the watch/short/permalink
        # surface) — log the delivery impression (the un-gameable floor).
        _log_deliveries([doc], reader, data.service, data.surface)
        # v3 ad preference: the single-doc read serves the pinned ad inline
        # too (the post detail deep link is a read, I3-checked).
        doc = ch.attach_pinned_ads([doc], reader)[0]
        # D57: node ad attachment (the third join — doc.ad + doc.node_ad).
        doc = ch.attach_node_ads([doc], reader)[0]
        return _mint_hls_manifest_urls(ch.resolve_media_urls_in_docs([doc]), reader, authenticated)[0]

    if not data.groups:
        raise exceptions.CRUD

    if "me" in data.groups:
        # "my groups" = the groups my effective role can read this service in.
        candidates = [g["group_id"] for g in ch.get_user_groups(reader_principal)]
        group_ids = ch.readable_groups(reader_principal, data.service, authenticated, candidates)
    else:
        # D58 read gate: filter to the groups the reader's effective role
        # grants readAll on this service (members via their role, bystanders
        # via the anyone/authenticated grant).
        group_ids = ch.readable_groups(reader_principal, data.service, authenticated, data.groups)
        # D42: distinguish "group missing / not a member" from "no notes yet"
        # (which returns an empty list). If the reader's effective role grants
        # readAll on NONE of the requested groups, this is an access failure the
        # app can act on (prompt for group setup / fix access) — not an empty
        # result. The message is a stable contract the demos + e2e key off
        # (`/not a member/i`). Anon is exempt: it reads the public board, and an
        # empty board is a valid (empty) result.
        if authenticated and not group_ids:
            raise HTTPException(
                status_code=403,
                detail="not a member of the requested group",
            )

    if data.ref is not None:
        if data.count:
            # The engagement-count shape: {ref_value: count} for these posts.
            # GROUP BY ref_value through the safe-query engine — exact for the
            # reader's readable groups, no cap (the feed/trending server-side
            # count). group_ids is already the reader's readable set (above).
            return ch.read_ref_counts_by_ref(
                service=data.service,
                ref_values=data.ref,
                group_ids=group_ids,
                member_key=reader_principal,
            )
        # The ref filter (the flexible read, phase 1): "give me the
        # comments/reactions for these posts." Routed through the safe-query
        # engine (read_docs_by_ref → build_safe_query) so it carries the full
        # boundary — group filter + block/sharing/hidden — not just a raw
        # WHERE. group_ids is already the reader's readable set (above).
        docs = ch.read_docs_by_ref(
            service=data.service,
            ref_values=data.ref,
            group_ids=group_ids,
            member_key=reader_principal,
            limit=data.limit,
            cursor=data.cursor,
            order=data.order,
        )
        docs = ch.attach_pinned_ads(docs, reader)
        docs = ch.attach_node_ads(docs, reader)
        return _mint_hls_manifest_urls(ch.resolve_media_urls_in_docs(docs), reader, authenticated)

    docs = ch.read_documents_in_groups(
        group_ids=group_ids,
        member_key=reader_principal,
        service=data.service,
        limit=data.limit,
        offset=data.offset,
        sort=data.sort.model_dump() if data.sort else None,
        # D58: group_ids is already filtered to the readable set — drop the
        # membership JOIN (a public group's reader is not a member).
        require_membership=False,
        # The generic server-side tag filter (has(tags, …)): the doc must
        # carry every given tag. A platform primitive — the Shorts feed is the
        # first consumer (["short"]); the render-time gate stays the backstop.
        tags=data.tags,
    )
    # D86: a group read is a content view (the feed/discover/profile/board
    # surfaces) — log a delivery impression per returned doc.
    _log_deliveries(docs, reader, data.service, data.surface)
    # v3 ad preference: serve each pinned doc with its ad inline (I3-checked).
    docs = ch.attach_pinned_ads(docs, reader)
    # D57: node ad attachment (the third join — doc.ad + doc.node_ad).
    docs = ch.attach_node_ads(docs, reader)
    return _mint_hls_manifest_urls(ch.resolve_media_urls_in_docs(docs), reader, authenticated)


@router.post("/update")
def update_document(request: Request, data: UpdateDocument):
    """Update a document (new version + optional group changes).

    Explicit author_as selects the group's document and requires a current
    updateOwn grant on its service. Original posters may also use the shipped
    posted_by lookup. Neither path changes the author or original audit actor.
    """
    author = _user(data)
    if data.author_as:
        existing = ch.get_document(data.doc_id, data.author_as)
        if not existing:
            raise exceptions.ENTRY_NOT_FOUND
        perms = ch.effective_role_perms(data.author_as, author, authenticated=True)
        if not ch.get_group(data.author_as) or not ch._effective_allows(perms, existing["service"], "updateOwn"):
            raise HTTPException(status_code=403, detail="no permission to update as this group")
        author = data.author_as
    else:
        existing = ch.get_document(data.doc_id, author)
    if not existing:
        # Group-as-author fallback: the doc's author_key is a group_id and
        # the caller is the human who posted it (posted_by = their username).
        # Find the doc by scanning for one where posted_by matches. We use a
        # targeted query rather than a table scan — the doc_id is known.
        result_rows = ch.client.query(
            "SELECT author_key FROM documents WHERE doc_id = %(doc_id)s AND posted_by = %(poster)s AND deleted = 0 ORDER BY updated_at DESC LIMIT 1",
            {"doc_id": data.doc_id, "poster": author},
        )
        if result_rows.result_rows:
            group_author = result_rows.result_rows[0][0]
            existing = ch.get_document(data.doc_id, group_author)
            if existing:
                # Editing requires its own live grant, not a create grant.
                perms = ch.effective_role_perms(group_author, author, authenticated=True)
                if not ch._effective_allows(perms, existing["service"], "updateOwn"):
                    raise HTTPException(
                        status_code=403,
                        detail="no permission to edit this group post",
                    )
                author = group_author  # the write uses the group's key
        else:
            raise exceptions.ENTRY_NOT_FOUND
    _check_app_permission(request, _user(data), existing["service"], "updateOwn", client_id_of(data))
    if data.groups is not None:
        stored_groups = ch.get_doc_groups(data.doc_id) if data.author_as and author in data.groups else []
        for group in data.groups:
            if data.author_as and group == author:
                # Live updateOwn already passed. Retaining self needs no new
                # create grant; adding self does, even with self-membership.
                allowed = group in stored_groups or ch._effective_allows(perms, existing["service"], "create")
            else:
                allowed = ch.can_write_group(group, author, existing["service"])
            if not allowed:
                raise HTTPException(status_code=403, detail="no write access to the requested group")

    merged_body = {**existing["body"], **data.body}
    # Preserve the existing ad preference unless the update sets one.
    ad_mode = data.ad_preference.mode if data.ad_preference else existing.get("ad_mode", "none")
    ad_target = (data.ad_preference.target or "") if data.ad_preference else existing.get("ad_target", "")
    result = ch.update_document(
        doc_id=data.doc_id,
        author_key=author,
        service=existing["service"],
        body=merged_body,
        ref_value=existing.get("ref_value", ""),
        tags=merged_body.get("tags", []),
        ad_mode=ad_mode,
        ad_target=ad_target,
    )

    if data.groups is not None:
        ch.replace_doc_groups(data.doc_id, data.groups)
        result["groups"] = data.groups
    else:
        result["groups"] = ch.get_doc_groups(data.doc_id)

    return result


@router.post("/attachment")
def document_attachment(request: Request, data: DocumentAttachment):
    """Read/set one attachment, never a read-filtered replacement list."""
    human = _user(data)
    author = data.author_as or human
    existing = ch.get_document(data.doc_id, author)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND
    service = existing["service"]
    perms = None
    if data.author_as:
        perms = ch.effective_role_perms(author, human, authenticated=True)
        if not ch.get_group(author) or not ch._effective_allows(perms, service, "updateOwn"):
            raise HTTPException(status_code=403, detail="no permission to update as this group")
    _check_app_permission(request, human, service, "updateOwn", client_id_of(data))
    attached = data.group_id in ch.get_doc_groups(data.doc_id)
    if data.attached is True:
        allowed = (
            attached or ch._effective_allows(perms, service, "create")
            if data.author_as and data.group_id == author
            else ch.can_write_group(data.group_id, author, service)
        )
        if not allowed:
            raise HTTPException(status_code=403, detail="no write access to the requested group")
    if data.attached is not None:
        ch.set_doc_attachment(data.doc_id, data.group_id, data.attached)
        attached = data.attached
    log.info("[documents] attachment: mutation=%s attached=%s", data.attached is not None, attached)
    return {"doc_id": data.doc_id, "group_id": data.group_id, "attached": attached}


@router.post("/delete")
def delete_document(request: Request, data: DeleteDocument):
    """Tombstone a document; author_as requires a live group deleteOwn grant."""
    author = _user(data)
    if data.author_as:
        existing = ch.get_document(data.doc_id, data.author_as)
        if not existing:
            raise exceptions.ENTRY_NOT_FOUND
        perms = ch.effective_role_perms(data.author_as, author, authenticated=True)
        if not ch.get_group(data.author_as) or not ch._effective_allows(perms, existing["service"], "deleteOwn"):
            raise HTTPException(status_code=403, detail="no permission to delete as this group")
        author = data.author_as
    else:
        existing = ch.get_document(data.doc_id, author)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND
    _check_app_permission(request, _user(data), existing["service"], "deleteOwn", client_id_of(data))

    ch.delete_document(data.doc_id, author, existing["service"])
    ch.detach_doc_from_groups(data.doc_id)
    return {"doc_id": data.doc_id, "status": "deleted"}


@router.post("/trackContentEvent")
def track_content_event(request: Request, data: TrackContentEvent):
    """Record a client-reported content event (D86): a `viewport` (the reader
    saw the doc for Ns / M%), a `click` (a CTA tapped), or an app-defined type.

    The anti-gaming boundary is the **preceding-delivery gate**: the node only
    accepts a viewport/click for a doc it actually served to this reader on
    this surface (within the delivery window), so a reader in devtools cannot
    fabricate dwell on a post they were never shown. It is also deduped per
    (doc, reader, surface, type) per window (a re-report within the window is a
    no-op). Anon is rejected (only a verified reader is counted — D41's
    "readable by design" is for the board, not the metrics). The `payload` is
    stored verbatim, content-free (D60: the app owns the payload's meaning).
    """
    reader = _user(data)  # verified reader only (anon rejected)
    _check_app_permission(request, reader, data.service, "readAll", client_id_of(data))
    recorded = ch.record_content_event(
        doc_id=data.doc_id,
        service=data.service,
        reader_key=reader,
        surface=data.surface,
        event_type=data.type,
        payload=data.payload,
    )
    return {"doc_id": data.doc_id, "recorded": recorded}


@router.post("/contentAnalytics")
def content_analytics(request: Request, data: ContentAnalyticsRequest):
    """The creator's own content metrics (D86) — the dashboard's data source.

    I3-bound by construction: the aggregate is scoped to docs the caller
    **authored** (``documents.author_key = reader``), so a creator can only
    ever see their own content's events — never another creator's. (The
    generic query engine cannot reach ``content_events`` — it is a raw node
    table, not a service — so this is the dedicated, author-scoped read the
    D86 plan calls for: "creator/admin-scoped, I3-bound to the caller's own
    docs.") ``service`` is the content service; ``window_days`` the trailing
    window. Returns one row per (doc, surface, day); the client aggregates up
    to totals / per-surface / time-series / per-doc.
    """
    reader = _user(data)  # verified creator only (anon rejected)
    _check_app_permission(request, reader, data.service, "readAll", client_id_of(data))
    rows = ch.content_event_creator_rows(reader, data.service, data.window_days)
    return {"rows": rows, "count": len(rows)}


@router.post("/contentViews")
def content_views(request: Request, data: ContentViewsRequest):
    """The on-surface view metrics (D86): **impressions** (total delivery
    events) + **reach** (distinct readers) per doc, read by the VIEWER for docs
    they can read. The on-surface "N views" shows both — the eye icon =
    impressions, the person icon = reach.

    Anon-capable (like the board read): a signed-out visitor on the public
    board sees the metrics too. I3-scoped: a doc only returns metrics if it is
    in one of the reader's readable groups for the service (the ``doc_groups``
    join) — a reader sees a post's metrics only if they can read that post. The
    counts themselves are global; the group filter limits WHICH docs the reader
    can query, not the count. No window filter — the on-surface number is a
    lifetime count (bounded by the table's 1-year TTL). This is the SAME object
    the D86 engine records (the delivery impression), so the on-surface number
    and the dashboard are one source of truth.

    NOTE (anon gap, planned): delivery is currently logged for verified readers
    only, so signed-out viewers don't yet count toward impressions/reach.
    Supporting anon (coarse IP dedupe) is a planned follow-up — see the D86
    anon-delivery plan item.
    """
    reader = user_or_anon(data)
    authenticated = reader != "anon"
    reader_principal = principal(data) if authenticated else "anon"
    reader = reader_principal
    if authenticated:
        _check_app_permission(request, reader, data.service, "readAll", client_id_of(data))
    # D58 read gate: filter to the groups the reader's effective role grants
    # readAll on this service (the same gate the group read uses). Anon reads
    # the public board (the `anyone` grant).
    group_ids = ch.readable_groups(reader_principal, data.service, authenticated, data.groups)
    return ch.content_event_views_for_docs(data.doc_ids, data.service, group_ids)
