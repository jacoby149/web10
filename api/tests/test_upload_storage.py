import json
from unittest.mock import Mock

import pytest

from app.services.upload_storage import ensure_private_state_bucket
from tests.test_upload_sessions import StorageError


def client(policy=None, grants=None):
    s3 = Mock()
    s3.get_bucket_policy.return_value = {"Policy": json.dumps(policy or {})}
    s3.get_bucket_acl.return_value = {
        "Owner": {"ID": "owner"},
        "Grants": grants or [{"Grantee": {"ID": "owner", "Type": "CanonicalUser"}, "Permission": "FULL_CONTROL"}],
    }
    return s3


def test_private_aws_and_minio_compatibility_acl_are_supported():
    s3 = client()
    ensure_private_state_bucket(s3, "state", "media")
    s3.get_bucket_acl.return_value = {
        "Owner": {"ID": "", "DisplayName": ""},
        "Grants": [{"Grantee": {"Type": "CanonicalUser"}, "Permission": "FULL_CONTROL"}],
    }
    ensure_private_state_bucket(s3, "state", "media")
    s3.create_bucket.assert_not_called()


@pytest.mark.parametrize(
    "statement",
    [
        {"Effect": "Allow", "Principal": "*"},
        {"Effect": "Allow", "Principal": {"AWS": ["*"]}},
        {"Effect": "Allow", "NotPrincipal": {"AWS": "some-account"}},
    ],
)
def test_public_bucket_policies_are_rejected_without_rewriting_them(statement):
    s3 = client({"Statement": [statement]})
    with pytest.raises(ValueError):
        ensure_private_state_bucket(s3, "state", "media")
    s3.put_bucket_policy.assert_not_called()


def test_public_acl_or_empty_unsupported_acl_is_denied():
    s3 = client(grants=[{"Grantee": {"URI": "http://acs.amazonaws.com/groups/global/AllUsers"}, "Permission": "READ"}])
    with pytest.raises(ValueError):
        ensure_private_state_bucket(s3, "state", "media")
    s3.get_bucket_acl.return_value = {"Owner": {}, "Grants": []}
    with pytest.raises(ValueError):
        ensure_private_state_bucket(s3, "state", "media")


def test_only_known_missing_bucket_and_missing_policy_are_handled():
    s3 = client()
    s3.head_bucket.side_effect = StorageError("NoSuchBucket")
    s3.get_bucket_policy.side_effect = StorageError("NoSuchBucketPolicy")
    ensure_private_state_bucket(s3, "state", "media")
    s3.create_bucket.assert_called_once_with(Bucket="state")
    s3.head_bucket.side_effect = StorageError("AccessDenied")
    with pytest.raises(StorageError):
        ensure_private_state_bucket(s3, "state", "media")
    with pytest.raises(ValueError):
        ensure_private_state_bucket(s3, "media", "media")
