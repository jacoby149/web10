"""Tests for the import worker (app/v3/services/import_worker.py).

Focus: the pure/semi-pure logic — archive extraction (tar + zip), the write
pipeline's ordering + the D62 comment join + idempotency, and the job-row
updated_at monotonicity invariant. The durable-queue / thread lifecycle is
integration-level (e2e), not unit-testable here.
"""

import io
import tarfile
import zipfile
from datetime import datetime
from unittest.mock import MagicMock, patch

from app.v3.services import import_worker as iw

# ---------------------------------------------------------------------------
# _parse_iso_utc
# ---------------------------------------------------------------------------


class TestParseIsoUtc:
    def test_z_suffix(self):
        dt = iw._parse_iso_utc("2019-05-01T12:00:00Z")
        assert dt == datetime(2019, 5, 1, 12, 0, 0)
        assert dt.tzinfo is None  # naive UTC

    def test_offset_suffix(self):
        dt = iw._parse_iso_utc("2019-05-01T12:00:00+00:00")
        assert dt == datetime(2019, 5, 1, 12, 0, 0)

    def test_none(self):
        assert iw._parse_iso_utc(None) is None

    def test_garbage(self):
        assert iw._parse_iso_utc("not a date") is None


# ---------------------------------------------------------------------------
# followers_group_id
# ---------------------------------------------------------------------------


class TestFollowersGroupId:
    def test_derivation(self):
        # Must match the social app's followersGroupId: {provider}/groups/users/{user}/followers
        assert iw.followers_group_id("alice") == f"{iw.settings.PROVIDER}/groups/users/alice/followers"


# ---------------------------------------------------------------------------
# _is_zip
# ---------------------------------------------------------------------------


class TestIsZip:
    def test_zip_magic(self, tmp_path):
        p = tmp_path / "a.zip"
        p.write_bytes(b"PK\x03\x04" + b"rest")
        assert iw._is_zip(p) is True

    def test_tar_not_zip(self, tmp_path):
        p = tmp_path / "a.tar"
        p.write_bytes(b"not a zip at all")
        assert iw._is_zip(p) is False


# ---------------------------------------------------------------------------
# _extract_json_entries (tar + zip, the Takeout shape)
# ---------------------------------------------------------------------------


def _make_tar(path, members):
    with tarfile.open(path, "w") as tf:
        for name, data in members:
            data = data.encode() if isinstance(data, str) else data
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))


def _make_zip(path, members):
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in members:
            zf.writestr(name, data)


class TestExtractJsonEntries:
    def test_tar(self, tmp_path):
        part = tmp_path / "part-000"
        _make_tar(part, [
            ("YouTube and Google/My videos/videos.json", '{"items": []}'),
            ("YouTube and Google/My videos/video.mp4", b"binary"),
        ])
        entries = iw._extract_json_entries(tmp_path)
        names = {n for n, _ in entries}
        assert names == {"YouTube and Google/My videos/videos.json"}
        # non-JSON members are excluded

    def test_zip(self, tmp_path):
        part = tmp_path / "part-000"
        _make_zip(part, [
            ("YouTube and Google/My videos/videos.json", '{"items": []}'),
            ("YouTube and Google/My videos/video.mp4", b"binary"),
        ])
        entries = iw._extract_json_entries(tmp_path)
        names = {n for n, _ in entries}
        assert names == {"YouTube and Google/My videos/videos.json"}

    def test_mixed_parts(self, tmp_path):
        # A 2GB-split export is multiple parts — some tar, some zip. Both parse.
        _make_tar(tmp_path / "part-000", [("a/videos.json", '{"items": []}')])
        _make_zip(tmp_path / "part-001", [("a/comments.json", '{"items": []}')])
        entries = iw._extract_json_entries(tmp_path)
        names = {n for n, _ in entries}
        assert names == {"a/videos.json", "a/comments.json"}

    def test_empty_dir(self, tmp_path):
        assert iw._extract_json_entries(tmp_path) == []


# ---------------------------------------------------------------------------
# _write_records — the pipeline (ordering + D62 join + idempotency)
# ---------------------------------------------------------------------------


def _records():
    """Two videos (one with a thumbnail), two comments (one orphan), one channel.

    `origin_id` lives in BOTH the record (the idempotency key the worker reads
    as rec["origin_id"]) and the body (what _existing_origin_ids scans via
    JSONExtractString) — the real parser writes it to both.
    """
    return [
        {"service": "staging_posts", "origin_id": "v1", "ref_origin_id": None,
         "media_url": "https://i.ytimg.com/vi/v1/hq720.jpg",
         "body": {"text": "One", "created_at": "2019-01-01T00:00:00Z", "tags": ["a"], "origin_id": "v1"}},
        {"service": "staging_posts", "origin_id": "v2", "ref_origin_id": None,
         "media_url": None,
         "body": {"text": "Two", "created_at": "2019-02-01T00:00:00Z", "tags": [], "origin_id": "v2"}},
        {"service": "comments", "origin_id": "c1", "ref_origin_id": "v1",
         "media_url": None, "body": {"text": "on v1", "created_at": "2019-01-02T00:00:00Z", "origin_id": "c1"}},
        {"service": "comments", "origin_id": "c2", "ref_origin_id": "nope",
         "media_url": None, "body": {"text": "orphan", "created_at": "2019-01-03T00:00:00Z", "origin_id": "c2"}},
        {"service": "profile", "origin_id": "UC1", "ref_origin_id": None,
         "media_url": None, "body": {"display_name": "Me", "bio": "hi", "website": None, "origin_id": "UC1"}},
    ]


def _mock_ch(calls):
    """Patch the ClickHouse surface _write_records touches. Returns the patchers."""
    empty_query = MagicMock()
    empty_query.result_rows = []

    def fake_insert_document(author_key, service, body, ref_value="", tags=None,
                             doc_id=None, ad_mode="none", ad_target="", created_at=None):
        calls.append(("insert", service, body.get("origin_id"), ref_value, created_at))
        return {"doc_id": f"doc-{body.get('origin_id') or service}"}

    def fake_attach(doc_id, group_ids):
        calls.append(("attach", doc_id, tuple(group_ids)))

    def fake_confirm(user_key, metadata):
        calls.append(("media", metadata.get("origin_id")))
        return {"doc_id": f"media-{metadata.get('origin_id')}"}

    return [
        patch("app.v3.services.clickhouse.client.query", return_value=empty_query),
        patch("app.v3.services.clickhouse.insert_document", side_effect=fake_insert_document),
        patch("app.v3.services.clickhouse.attach_doc_to_groups", side_effect=fake_attach),
        patch("app.v3.services.clickhouse.confirm_media_upload", side_effect=fake_confirm),
    ]


class TestWriteRecords:
    def _run(self, records, existing=None, has_profile=False):
        calls = []
        # _existing_origin_ids + _user_has_profile both call ch.client.query —
        # steer them: existing origin_ids empty, no profile (unless has_profile).
        def fake_query(sql, params=None):
            res = MagicMock()
            if "count()" in sql:  # _user_has_profile
                res.result_rows = [[1 if has_profile else 0]]
            else:  # _existing_origin_ids
                res.result_rows = existing or []
            return res

        patches = _mock_ch(calls)
        patches.append(patch("app.v3.services.clickhouse.client.query", side_effect=fake_query))
        patches.append(patch("app.services.media.get_s3_client", return_value=MagicMock()))
        patches.append(patch("app.services.media.make_object_key", return_value="k/thumb.jpg"))
        fake_resp = MagicMock()
        fake_resp.content = b"thumbbytes"
        fake_resp.raise_for_status = MagicMock()
        patches.append(patch("app.v3.services.import_worker.requests.get", return_value=fake_resp))

        for p in patches:
            p.start()
        try:
            written, skipped, errors = iw._write_records("job-1", "alice", records, "g-followers")
        finally:
            for p in patches:
                p.stop()
        return written, skipped, errors, calls

    def test_ordering_media_posts_comments_profile(self):
        _, _, _, calls = self._run(_records())
        kinds = [c[0] for c in calls]
        # media first, then posts, then comments, then profile
        assert kinds.index("media") < kinds.index("insert")
        # the profile insert is the last insert
        inserts = [i for i, c in enumerate(calls) if c[0] == "insert"]
        assert calls[inserts[-1]][1] == "profile"

    def test_comment_ref_value_is_post_doc_id(self):
        # The D62 join: a comment's ref_value = the imported post's doc_id
        # (server-generated), NOT the YouTube video id.
        _, _, _, calls = self._run(_records())
        comment_inserts = [c for c in calls if c[0] == "insert" and c[1] == "comments"]
        assert len(comment_inserts) == 1  # the orphan is skipped
        # doc_id for v1 is "doc-v1" (from the fake insert)
        assert comment_inserts[0][3] == "doc-v1"

    def test_orphan_comment_skipped(self):
        written, skipped, errors, _ = self._run(_records())
        # written: 1 media (v1 thumb) + 2 posts + 1 comment (c1) + 1 profile = 5
        # skipped: 1 (the orphan comment c2)
        assert written == 5
        assert skipped == 1
        assert any("no post for video" in e for e in errors)

    def test_profile_not_overwritten(self):
        # If the user already has a profile, the import keeps it (skipped).
        written, skipped, errors, calls = self._run(_records(), has_profile=True)
        assert not any(c[0] == "insert" and c[1] == "profile" for c in calls)
        # written: 1 media + 2 posts + 1 comment = 4 (no profile)
        assert written == 4

    def test_idempotent_rerun_skips_existing(self):
        # A re-run: v1 + c1 already exist. Only v2 + the profile are new.
        existing = [
            ["doc-v1", "v1"],   # staging_posts v1
            ["doc-c1", "c1"],   # comments c1
            ["doc-thumb_v1", "thumb_v1"],  # media_metadata for v1's thumb
        ]
        written, skipped, errors, calls = self._run(_records(), existing=existing)
        inserted_origins = {c[2] for c in calls if c[0] == "insert"}
        assert "v1" not in inserted_origins  # skipped
        assert "v2" in inserted_origins
        # c1 skipped (existing), c2 is an orphan (skipped) -> no comment inserts
        assert not any(c[0] == "insert" and c[1] == "comments" for c in calls)
        assert written == 2  # v2 post + profile
        assert skipped >= 3  # v1, c1, thumb_v1, + orphan c2

    def test_created_at_backdates_posts(self):
        # "take your videos exactly" — the post's created_at = the original publish date.
        _, _, _, calls = self._run(_records())
        post_v1 = next(c for c in calls if c[0] == "insert" and c[2] == "v1")
        assert post_v1[4] == datetime(2019, 1, 1, 0, 0, 0)


# ---------------------------------------------------------------------------
# update_import_job — the updated_at monotonicity invariant (3.58.1's race)
# ---------------------------------------------------------------------------


class TestUpdateJobMonotonic:
    def test_updated_at_strictly_increases_on_tie(self):
        # A same-microsecond update must not tie the current latest row (the
        # ReplacingMergeTree dedup would let the OLD row win and the update
        # would silently vanish). Pin _now to the SAME instant as the existing
        # row's updated_at to force the tie, and assert the bump.
        fixed = datetime(2026, 1, 1, 0, 0, 0, 123456)
        captured = {}

        def fake_get(job_id):
            return {
                "job_id": job_id, "user_key": "u", "platform": "youtube",
                "phase": "queued", "object_keys": [], "total_records": 0,
                "written_records": 0, "skipped_records": 0, "errors": [],
                "message": "m", "created_at": "2026-01-01T00:00:00",
                "updated_at": fixed.isoformat(),
            }

        def fake_insert(table, rows, column_names=None):
            captured["updated_at"] = rows[0][column_names.index("updated_at")]

        with (
            patch.object(iw, "get_import_job", side_effect=fake_get),
            patch.object(iw, "_now", return_value=fixed),
            patch("app.v3.services.clickhouse.client.insert", side_effect=fake_insert),
        ):
            iw.update_import_job("j1", phase="processing")

        # The tie (now == current) must be broken: new updated_at = current + 1us.
        assert captured["updated_at"] == fixed + __import__("datetime").timedelta(microseconds=1)
