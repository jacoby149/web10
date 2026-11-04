"""Provision a separate private state bucket; never rewrite an existing access policy."""

import json

from app.services.multipart_uploads import error_code


def ensure_private_state_bucket(s3, bucket, media_bucket):
    if not bucket or bucket == media_bucket:
        raise ValueError("upload state bucket must be separate")
    try:
        s3.head_bucket(Bucket=bucket)
    except Exception as error:
        if error_code(error) not in {"NoSuchBucket", "404", "NotFound"}:
            raise
        try:
            s3.create_bucket(Bucket=bucket)
        except Exception as creation:
            if error_code(creation) != "BucketAlreadyOwnedByYou":
                raise
    try:
        policy = json.loads(s3.get_bucket_policy(Bucket=bucket)["Policy"])
    except Exception as error:
        if error_code(error) not in {"NoSuchBucketPolicy", "NoSuchPolicy"}:
            raise
        policy = {}
    statements = policy.get("Statement", [])
    if not isinstance(statements, list):
        raise ValueError("invalid state bucket policy")
    for statement in statements:
        if statement.get("Effect") != "Allow":
            continue
        if "NotPrincipal" in statement:
            raise ValueError("upload state bucket has broad principal access")
        principal = statement.get("Principal")
        if principal == "*" or (
            isinstance(principal, dict)
            and any(value == "*" or isinstance(value, list) and "*" in value for value in principal.values())
        ):
            raise ValueError("upload state bucket permits public access")
    acl = s3.get_bucket_acl(Bucket=bucket)
    owner_id = acl.get("Owner", {}).get("ID")
    # MinIO does not implement ACL authorization; its compatibility response is
    # this exact owner-only stub. Bucket policy above remains authoritative.
    minio_stub = not owner_id and acl.get("Grants") == [
        {"Grantee": {"Type": "CanonicalUser"}, "Permission": "FULL_CONTROL"}
    ]
    if not minio_stub and (
        not owner_id or any(grant.get("Grantee", {}).get("ID") != owner_id for grant in acl.get("Grants", []))
    ):
        raise ValueError("upload state bucket has non-owner ACL grants")
