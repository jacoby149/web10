"""Tests for media service helpers."""

from unittest.mock import MagicMock, patch

import app.settings as settings
from app.services.media import ensure_bucket, get_s3_client, get_s3_signing_client, make_object_key


class TestMakeObjectKey:
    def test_format(self):
        with patch("app.services.media.uuid.uuid4") as mock_uuid:
            mock_uuid.return_value.hex = "abcd1234"
            key = make_object_key("alice", "photo.jpg")
            assert key == "alice/abcd1234/photo.jpg"

    def test_different_filenames(self):
        with patch("app.services.media.uuid.uuid4") as mock_uuid:
            mock_uuid.return_value.hex = "1111"
            key = make_object_key("bob", "vid.mp4")
            assert key == "bob/1111/vid.mp4"

    def test_nested_filename(self):
        with patch("app.services.media.uuid.uuid4") as mock_uuid:
            mock_uuid.return_value.hex = "2222"
            key = make_object_key("user", "dir/file.txt")
            assert key == "user/2222/dir/file.txt"


class TestEnsureBucket:
    def test_existing_bucket_no_create(self):
        mock_s3 = MagicMock()
        ensure_bucket(mock_s3)
        mock_s3.head_bucket.assert_called_once()
        mock_s3.create_bucket.assert_not_called()

    def test_missing_bucket_creates(self):
        mock_s3 = MagicMock()
        mock_s3.head_bucket.side_effect = Exception("Not Found")
        ensure_bucket(mock_s3)
        mock_s3.head_bucket.assert_called_once()
        mock_s3.create_bucket.assert_called_once()


class TestS3ClientEndpoints:
    """The internal client talks to MinIO; the signing client mints the URLs
    the browser sees, so it must use the PUBLIC endpoint — otherwise presigned
    URLs embed the unreachable internal Docker host (Mixed-Content block)."""

    def test_internal_client_uses_internal_endpoint(self):
        with patch("app.services.media.boto3.client") as mock_client:
            get_s3_client()
            _, kwargs = mock_client.call_args
            assert kwargs["endpoint_url"] == settings.S3_ENDPOINT
            assert kwargs["use_ssl"] == settings.S3_USE_SSL

    def test_signing_client_uses_public_endpoint(self):
        with patch("app.services.media.boto3.client") as mock_client:
            get_s3_signing_client()
            _, kwargs = mock_client.call_args
            assert kwargs["endpoint_url"] == settings.S3_PUBLIC_ENDPOINT
            assert kwargs["use_ssl"] == settings.S3_PUBLIC_USE_SSL

    def test_public_endpoint_defaults_to_internal(self):
        # Local/e2e run one host for both; the default must not diverge.
        assert settings.S3_PUBLIC_ENDPOINT == settings.S3_ENDPOINT
