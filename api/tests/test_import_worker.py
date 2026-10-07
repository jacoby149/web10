"""Tests for the import worker (app/v3/services/import_worker.py).

Focus: the pure/semi-pure logic — archive extraction (tar + zip), the write
pipeline's ordering + the D62 comment join + idempotency, job-row updated_at
monotonicity, and bounded queue admission / recovery.
"""

import io
import queue
import tarfile
import zipfile
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from app.v3.services import import_worker as iw


class TestQueueLimits:
    def test_stale_completed_job_is_not_requeued(self, monkeypatch):
        jobs = queue.Queue(maxsize=1)
        monkeypatch.setattr(iw, "_job_queue", jobs)
        monkeypatch.setattr(iw, "_submitted_jobs", set())
        with (
            patch.object(iw, "_ensure_started"),
            patch.object(iw, "get_import_job", return_value={"phase": iw.COMPLETE}),
            patch.object(iw, "update_import_job") as update,
        ):
            iw.submit_import_job("done")
        update.assert_not_called()
        assert jobs.empty()

    def test_full_queue_does_not_persist_or_block(self, monkeypatch):
        jobs = queue.Queue(maxsize=1)
        jobs.put_nowait("existing")
        monkeypatch.setattr(iw, "_job_queue", jobs)
        monkeypatch.setattr(iw, "_submitted_jobs", set())
        with patch.object(iw, "_ensure_started"), patch.object(iw, "update_import_job") as update:
            with pytest.raises(queue.Full):
                iw.submit_import_job("new")
        update.assert_not_called()
        assert jobs.get_nowait() == "existing"

    def test_duplicate_job_uses_one_slot(self, monkeypatch):
        jobs = queue.Queue(maxsize=1)
        monkeypatch.setattr(iw, "_job_queue", jobs)
        monkeypatch.setattr(iw, "_submitted_jobs", set())
        with patch.object(iw, "_ensure_started"), patch.object(iw, "update_import_job") as update:
            iw.submit_import_job("new")
            iw.submit_import_job("new")
        update.assert_called_once()
        assert jobs.qsize() == 1

    def test_recovery_pages_and_retries_full_queue(self):
        page = MagicMock(result_rows=[("a",), ("b",)])
        empty = MagicMock(result_rows=[])
        with (
            patch.object(iw.ch.client, "query", side_effect=[page, empty]) as query,
            patch.object(iw, "submit_import_job", side_effect=[queue.Full, None, None]) as submit,
            patch.object(iw.time, "sleep"),
        ):
            iw._resubmit_active_jobs()
        assert [c.args[0] for c in submit.call_args_list] == ["a", "a", "b"]
        assert query.call_args.args[1] == {"last_job_id": "b"}
        assert "LIMIT 100" in query.call_args.args[0]


class TestDownloadLimits:
    @pytest.mark.parametrize("advertised,actual", [(9, 9), (8, 9), (8, 7)])
    def test_oversized_or_changed_download(self, tmp_path, monkeypatch, advertised, actual):
        monkeypatch.setattr(iw, "MAX_PART_BYTES", 8)
        body = io.BytesIO(b"x" * actual)
        with patch.object(iw.media_svc, "get_s3_client") as s3:
            s3.return_value.get_object.return_value = {"ContentLength": advertised, "Body": body}
            with pytest.raises(ValueError, match="size"):
                iw._download_parts(["k"], tmp_path)
        assert body.closed

    def test_streamed_download_at_limit(self, tmp_path, monkeypatch):
        monkeypatch.setattr(iw, "MAX_PART_BYTES", 8)
        body = io.BytesIO(b"x" * 8)
        with patch.object(iw.media_svc, "get_s3_client") as s3:
            s3.return_value.get_object.return_value = {"ContentLength": 8, "Body": body}
            iw._download_parts(["k"], tmp_path)
        assert (tmp_path / "part-000").read_bytes() == b"x" * 8
        assert body.closed


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


class TestExtractDataEntries:
    def test_tar_extension_header_limit(self, tmp_path, monkeypatch):
        header = tarfile.TarInfo("././@PaxHeader")
        header.type = tarfile.XHDTYPE
        header.size = 33
        (tmp_path / "part-000").write_bytes(header.tobuf() + b"x" * 33)
        monkeypatch.setattr(iw, "MAX_TAR_HEADER_BYTES", 32)
        with pytest.raises(ValueError, match="extension header"):
            iw._extract_data_entries(tmp_path)

    @pytest.mark.parametrize("make_archive", [_make_zip, _make_tar])
    @pytest.mark.parametrize("extension", ["csv", "json"])
    def test_metadata_limit_before_read(self, tmp_path, monkeypatch, make_archive, extension):
        make_archive(tmp_path / "part-000", [(f"data.{extension}", b"x" * 33)])
        monkeypatch.setattr(iw, "MAX_METADATA_MEMBER_BYTES", 32)
        with patch.object(zipfile.ZipFile, "open", side_effect=AssertionError("must not read")):
            with pytest.raises(ValueError, match="metadata size"):
                iw._extract_data_entries(tmp_path)

    def test_deflated_zip_bomb(self, tmp_path, monkeypatch):
        with zipfile.ZipFile(tmp_path / "part-000", "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("data.csv", b"0" * 100_000)
        monkeypatch.setattr(iw, "MAX_METADATA_MEMBER_BYTES", 1000)
        with patch.object(zipfile.ZipFile, "open", side_effect=AssertionError("must not decompress")):
            with pytest.raises(ValueError, match="metadata size"):
                iw._extract_data_entries(tmp_path)

    @pytest.mark.parametrize("make_archive", [_make_zip, _make_tar])
    def test_expanded_size_includes_ignored_video(self, tmp_path, monkeypatch, make_archive):
        make_archive(tmp_path / "part-000", [("video.mp4", b"x" * 33)])
        monkeypatch.setattr(iw, "MAX_EXPANDED_PART_BYTES", 32)
        with pytest.raises(ValueError, match="expanded size"):
            iw._extract_data_entries(tmp_path)

    def test_zip_directory_preflight(self, tmp_path, monkeypatch):
        _make_zip(tmp_path / "part-000", [("video.mp4", b"x")])
        monkeypatch.setattr(iw, "MAX_ZIP_DIRECTORY_BYTES", 1)
        with patch.object(zipfile, "ZipFile", side_effect=AssertionError("must not allocate directory")):
            with pytest.raises(ValueError, match="directory"):
                iw._extract_data_entries(tmp_path)

    @pytest.mark.parametrize("make_archive", [_make_zip, _make_tar])
    def test_member_count(self, tmp_path, monkeypatch, make_archive):
        make_archive(tmp_path / "part-000", [("a.mp4", b"x"), ("b.mp4", b"x")])
        monkeypatch.setattr(iw, "MAX_ARCHIVE_MEMBERS", 1)
        with pytest.raises(ValueError, match="count|directory"):
            iw._extract_data_entries(tmp_path)

    def test_metadata_budget_across_parts(self, tmp_path, monkeypatch):
        _make_zip(tmp_path / "part-000", [("a.csv", b"x" * 16)])
        _make_tar(tmp_path / "part-001", [("b.json", b"x" * 17)])
        monkeypatch.setattr(iw, "MAX_METADATA_BYTES", 32)
        with pytest.raises(ValueError, match="metadata size"):
            iw._extract_data_entries(tmp_path)

    def test_member_budget_across_parts(self, tmp_path, monkeypatch):
        _make_zip(tmp_path / "part-000", [("a.mp4", b"x")])
        _make_tar(tmp_path / "part-001", [("b.mp4", b"x")])
        monkeypatch.setattr(iw, "MAX_ARCHIVE_MEMBERS", 1)
        with pytest.raises(ValueError, match="member count"):
            iw._extract_data_entries(tmp_path)

    def test_gzip_tar_metadata_bomb(self, tmp_path, monkeypatch):
        with tarfile.open(tmp_path / "part-000", "w:gz") as tf:
            member = tarfile.TarInfo("data.csv")
            member.size = 100_000
            tf.addfile(member, io.BytesIO(b"x" * member.size))
        monkeypatch.setattr(iw, "MAX_METADATA_MEMBER_BYTES", 1000)
        with patch.object(tarfile.TarFile, "extractfile", side_effect=AssertionError("must not read")):
            with pytest.raises(ValueError, match="metadata size"):
                iw._extract_data_entries(tmp_path)

    def test_compressed_part_limit(self, tmp_path, monkeypatch):
        _make_zip(tmp_path / "part-000", [("a.csv", b"x")])
        monkeypatch.setattr(iw, "MAX_PART_BYTES", 1)
        with pytest.raises(ValueError, match="upload size"):
            iw._extract_data_entries(tmp_path)

    def test_large_video_is_not_opened(self, tmp_path, monkeypatch):
        _make_zip(tmp_path / "part-000", [("video.mp4", b"x" * 1000), ("a.csv", b"ok")])
        monkeypatch.setattr(iw, "MAX_METADATA_MEMBER_BYTES", 2)
        original = zipfile.ZipFile.open

        def checked_open(zf, info, *args, **kwargs):
            assert info.filename == "a.csv"
            return original(zf, info, *args, **kwargs)

        with patch.object(zipfile.ZipFile, "open", checked_open):
            assert iw._extract_data_entries(tmp_path) == [("a.csv", b"ok")]

    def test_tar(self, tmp_path):
        part = tmp_path / "part-000"
        _make_tar(
            part,
            [
                ("Takeout/YouTube and YouTube Music/video metadata/videos.csv", "Video ID\nv1\n"),
                ("Takeout/YouTube and YouTube Music/videos/video.mp4", b"binary"),
            ],
        )
        entries = iw._extract_data_entries(tmp_path)
        names = {n for n, _ in entries}
        assert names == {"Takeout/YouTube and YouTube Music/video metadata/videos.csv"}
        # the MP4 (27GB in a real export) is deliberately NOT read

    def test_zip(self, tmp_path):
        part = tmp_path / "part-000"
        _make_zip(
            part,
            [
                ("Takeout/YouTube and YouTube Music/video metadata/videos.csv", "Video ID\nv1\n"),
                ("Takeout/YouTube and YouTube Music/videos/video.mp4", b"binary"),
            ],
        )
        entries = iw._extract_data_entries(tmp_path)
        names = {n for n, _ in entries}
        assert names == {"Takeout/YouTube and YouTube Music/video metadata/videos.csv"}

    def test_json_still_extracted(self, tmp_path):
        # JSON is kept for future/other platforms.
        _make_zip(tmp_path / "part-000", [("a/data.json", '{"items": []}')])
        entries = iw._extract_data_entries(tmp_path)
        assert {n for n, _ in entries} == {"a/data.json"}

    def test_mixed_parts(self, tmp_path):
        # A 2GB-split export is multiple parts — some tar, some zip. Both parse.
        _make_tar(tmp_path / "part-000", [("a/videos.csv", "Video ID\nv1\n")])
        _make_zip(tmp_path / "part-001", [("a/comments.csv", "Comment ID\nc1\n")])
        entries = iw._extract_data_entries(tmp_path)
        names = {n for n, _ in entries}
        assert names == {"a/videos.csv", "a/comments.csv"}

    def test_empty_dir(self, tmp_path):
        assert iw._extract_data_entries(tmp_path) == []


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
        {
            "service": "staging_posts",
            "origin_id": "v1",
            "ref_origin_id": None,
            "media_url": "https://i.ytimg.com/vi/v1/hq720.jpg",
            "body": {"text": "One", "created_at": "2019-01-01T00:00:00Z", "tags": ["a"], "origin_id": "v1"},
        },
        {
            "service": "staging_posts",
            "origin_id": "v2",
            "ref_origin_id": None,
            "media_url": None,
            "body": {"text": "Two", "created_at": "2019-02-01T00:00:00Z", "tags": [], "origin_id": "v2"},
        },
        {
            "service": "comments",
            "origin_id": "c1",
            "ref_origin_id": "v1",
            "media_url": None,
            "body": {"text": "on v1", "created_at": "2019-01-02T00:00:00Z", "origin_id": "c1"},
        },
        {
            "service": "comments",
            "origin_id": "c2",
            "ref_origin_id": "nope",
            "media_url": None,
            "body": {"text": "orphan", "created_at": "2019-01-03T00:00:00Z", "origin_id": "c2"},
        },
        {
            "service": "profile",
            "origin_id": "UC1",
            "ref_origin_id": None,
            "media_url": None,
            "body": {"display_name": "Me", "bio": "hi", "website": None, "origin_id": "UC1"},
        },
    ]


def _mock_ch(calls):
    """Patch the ClickHouse surface _write_records touches. Returns the patchers."""
    empty_query = MagicMock()
    empty_query.result_rows = []

    def fake_insert_document(
        author_key, service, body, ref_value="", tags=None, doc_id=None, ad_mode="none", ad_target="", created_at=None
    ):
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
            ["doc-v1", "v1"],  # staging_posts v1
            ["doc-c1", "c1"],  # comments c1
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
                "job_id": job_id,
                "user_key": "u",
                "platform": "youtube",
                "phase": "queued",
                "object_keys": [],
                "total_records": 0,
                "written_records": 0,
                "skipped_records": 0,
                "errors": [],
                "message": "m",
                "created_at": "2026-01-01T00:00:00",
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


# ---------------------------------------------------------------------------
# _clamp_progress — the UInt8 guard
# ---------------------------------------------------------------------------


class TestClampProgress:
    def test_in_range(self):
        assert iw._clamp_progress(42) == 42
        assert iw._clamp_progress(0) == 0
        assert iw._clamp_progress(100) == 100

    def test_clamps_high(self):
        assert iw._clamp_progress(101) == 100
        assert iw._clamp_progress(255) == 100

    def test_clamps_negative(self):
        assert iw._clamp_progress(-5) == 0

    def test_garbage(self):
        assert iw._clamp_progress(None) == 0
        assert iw._clamp_progress("n/a") == 0


# ---------------------------------------------------------------------------
# user_owns_group — the I3 target-group gate
# ---------------------------------------------------------------------------


class TestUserOwnsGroup:
    def test_owner_bare_key(self):
        # Followers groups enroll the owner under the bare username.
        with patch("app.v3.services.clickhouse.get_group_member") as gm:
            gm.return_value = {"member_key": "alice", "role": "owner"}
            assert iw.user_owns_group("alice", "g1") is True

    def test_owner_prefixed_key(self):
        # Community groups enroll the owner under {provider}/users/{username}.
        with patch("app.v3.services.clickhouse.get_group_member") as gm:
            gm.side_effect = lambda g, k: {"member_key": k, "role": "owner"} if k.endswith("/users/alice") else None
            assert iw.user_owns_group("alice", "g1") is True

    def test_member_not_owner(self):
        with patch("app.v3.services.clickhouse.get_group_member") as gm:
            gm.return_value = {"member_key": "alice", "role": "member"}
            assert iw.user_owns_group("alice", "g1") is False

    def test_not_a_member(self):
        with patch("app.v3.services.clickhouse.get_group_member") as gm:
            gm.return_value = None
            assert iw.user_owns_group("alice", "g1") is False


# ---------------------------------------------------------------------------
# _write_records (as_page) — the channel becomes the group's face (D60)
# ---------------------------------------------------------------------------


class TestWriteRecordsPage:
    def _run_page(self, has_face=False):
        calls = []

        def fake_query(sql, params=None):
            res = MagicMock()
            if "count()" in sql:
                # _user_has_profile / _group_has_face both count — the page
                # path only calls _group_has_face, which we patch separately,
                # so this is the (unused) profile count.
                res.result_rows = [[0]]
            else:
                res.result_rows = []
            return res

        def fake_insert_document(
            author_key,
            service,
            body,
            ref_value="",
            tags=None,
            doc_id=None,
            ad_mode="none",
            ad_target="",
            created_at=None,
        ):
            calls.append(("insert", service, body.get("origin_id")))
            return {"doc_id": f"doc-{body.get('origin_id') or service}"}

        def fake_attach(doc_id, group_ids):
            calls.append(("attach", doc_id, tuple(group_ids)))

        patches = [
            patch("app.v3.services.clickhouse.client.query", side_effect=fake_query),
            patch("app.v3.services.clickhouse.insert_document", side_effect=fake_insert_document),
            patch("app.v3.services.clickhouse.attach_doc_to_groups", side_effect=fake_attach),
            patch("app.v3.services.clickhouse.confirm_media_upload", return_value={"doc_id": "media-x"}),
            patch("app.services.media.get_s3_client", return_value=MagicMock()),
            patch("app.services.media.make_object_key", return_value="k/thumb.jpg"),
            patch.object(iw, "_group_has_face", return_value=has_face),
            patch(
                "app.v3.services.import_worker.requests.get",
                return_value=MagicMock(content=b"t", raise_for_status=MagicMock()),
            ),
        ]
        for p in patches:
            p.start()
        try:
            written, skipped, errors = iw._write_records("job-1", "alice", _records(), "g-page", as_page=True)
        finally:
            for p in patches:
                p.stop()
        return written, skipped, errors, calls

    def test_channel_becomes_group_face(self):
        # as_page: the channel writes to the identity service (the face), NOT
        # the personal profile service.
        _, _, _, calls = self._run_page(has_face=False)
        services = {c[1] for c in calls if c[0] == "insert"}
        assert iw.GROUP_IDENTITY_SERVICE in services
        assert "profile" not in services
        # The face doc is attached to the target group.
        face_attaches = [c for c in calls if c[0] == "attach"]
        assert all(c[2] == ("g-page",) for c in face_attaches)

    def test_existing_face_not_overwritten(self):
        # A group that already has a face keeps it — the import skips.
        written, skipped, _, calls = self._run_page(has_face=True)
        services = {c[1] for c in calls if c[0] == "insert"}
        assert iw.GROUP_IDENTITY_SERVICE not in services
        assert "profile" not in services
