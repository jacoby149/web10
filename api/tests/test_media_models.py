"""Tests for media Pydantic models."""

import pytest

from app.models.media import (
    MediaToken,
    MetadataCreate,
    MetadataRecord,
    ReadRequest,
    ReadResponse,
    UploadRequest,
    UploadResponse,
)


class TestMediaToken:
    def test_default_none(self):
        t = MediaToken()
        assert t.token is None

    def test_with_token(self):
        t = MediaToken(token="abc")
        assert t.token == "abc"

    def test_extra_fields_allowed(self):
        t = MediaToken(token="x", extra="field")
        assert t.token == "x"


class TestUploadRequest:
    def test_minimal(self):
        r = UploadRequest(filename="photo.jpg")
        assert r.filename == "photo.jpg"
        assert r.token is None
        assert r.mime_type is None
        assert r.size_bytes is None

    def test_full(self):
        r = UploadRequest(token="t", filename="vid.mp4", mime_type="video/mp4", size_bytes=1024)
        assert r.filename == "vid.mp4"
        assert r.mime_type == "video/mp4"
        assert r.size_bytes == 1024

    def test_missing_filename_raises(self):
        with pytest.raises(Exception):
            UploadRequest()


class TestUploadResponse:
    def test_fields(self):
        r = UploadResponse(upload_url="https://s3/upload", object_key="u/abc/photo.jpg", content_type="image/jpeg")
        assert r.upload_url == "https://s3/upload"
        assert r.object_key == "u/abc/photo.jpg"
        assert r.content_type == "image/jpeg"


class TestReadRequest:
    def test_valid(self):
        r = ReadRequest(object_key="u/abc/photo.jpg")
        assert r.object_key == "u/abc/photo.jpg"
        assert r.token is None

    def test_with_token(self):
        r = ReadRequest(token="t", object_key="k")
        assert r.token == "t"

    def test_missing_object_key_raises(self):
        with pytest.raises(Exception):
            ReadRequest()


class TestReadResponse:
    def test_fields(self):
        r = ReadResponse(read_url="https://s3/read", expires_in=60)
        assert r.read_url == "https://s3/read"
        assert r.expires_in == 60


class TestMetadataCreate:
    def test_minimal(self):
        m = MetadataCreate(url="https://s3/photo.jpg", filename="photo.jpg")
        assert m.url == "https://s3/photo.jpg"
        assert m.filename == "photo.jpg"
        assert m.mime_type is None
        assert m.origin == "web10"
        assert m.encrypted is False

    def test_full(self):
        m = MetadataCreate(
            url="https://s3/vid.mp4",
            filename="vid.mp4",
            mime_type="video/mp4",
            size_bytes=2048,
            width=1920,
            height=1080,
            duration_seconds=60.5,
            thumbnail_url="https://s3/thumb.jpg",
            caption="hello",
            alt_text="a video",
            origin="instagram",
            origin_id="ig_123",
            encrypted=True,
        )
        assert m.size_bytes == 2048
        assert m.width == 1920
        assert m.duration_seconds == 60.5
        assert m.origin == "instagram"
        assert m.encrypted is True

    def test_missing_url_raises(self):
        with pytest.raises(Exception):
            MetadataCreate(filename="x")

    def test_missing_filename_raises(self):
        with pytest.raises(Exception):
            MetadataCreate(url="https://x")


class TestMetadataRecord:
    def test_with_id(self):
        r = MetadataRecord.model_validate(
            {
                "_id": "507f1f77bcf86cd799439011",
                "url": "https://s3/photo.jpg",
                "filename": "photo.jpg",
                "created_at": "2026-01-01T00:00:00",
            }
        )
        assert r.model_extra["_id"] == "507f1f77bcf86cd799439011"
        assert r.created_at == "2026-01-01T00:00:00"

    def test_optional_fields(self):
        r = MetadataRecord(url="u", filename="f", created_at="2026-01-01T00:00:00")
        assert r.hls_manifest_url is None
        assert r.thumbnail_url is None

    def test_hls_manifest(self):
        r = MetadataRecord(
            url="u",
            filename="f",
            created_at="2026-01-01T00:00:00",
            hls_manifest_url="https://s3/manifest.m3u8",
        )
        assert r.hls_manifest_url == "https://s3/manifest.m3u8"
