"""Operator-only MinIO service-account update; no SDK or credentials at import time.

Pass an official minio.minioadmin.MinioAdmin instance. MinIO 2025-09-07 removes
an embedded policy on status-only updates, so status and policy must be atomic.
"""

import hashlib
import json
import re


def get_only_policy(bucket):
    if not isinstance(bucket, str) or not re.fullmatch(
        r"web10-cdn-smoke-\d{8}-[a-f0-9]{16}", bucket
    ):
        raise ValueError("invalid isolated bucket")
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{bucket}/*"],
            }
        ],
    }


def policy_matches(value, bucket):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return False
    if not isinstance(value, dict) or value.get("Version") != "2012-10-17":
        return False
    statements = value.get("Statement")
    if isinstance(statements, dict):
        statements = [statements]
    if (
        not isinstance(statements, list)
        or len(statements) != 1
        or not isinstance(statements[0], dict)
    ):
        return False
    statement = dict(statements[0])
    if statement.get("Sid") == "":
        statement.pop("Sid")
    for field in ("Action", "Resource"):
        if isinstance(statement.get(field), str):
            statement[field] = [statement[field]]
    return statement == get_only_policy(bucket)["Statement"][0]


def update_restricted_account(admin, access_key, account_name, bucket, status):
    policy = get_only_policy(bucket)
    expected_name = "cdn-smoke-" + hashlib.sha256(bucket.encode()).hexdigest()[:16]
    if account_name != expected_name or status not in ("on", "off"):
        raise ValueError("invalid account scope or status")
    if not isinstance(access_key, str) or not re.fullmatch(
        r"[A-Za-z0-9_-]{8,128}", access_key
    ):
        raise ValueError("invalid account key")
    before = json.loads(admin.get_service_account(access_key))
    if not isinstance(before, dict) or before.get("name") != account_name:
        raise ValueError("account ownership mismatch")
    try:
        admin.update_service_account(
            access_key=access_key, status=status, policy=policy
        )
        after = json.loads(admin.get_service_account(access_key))
        if (
            not isinstance(after, dict)
            or after.get("name") != account_name
            or after.get("accountStatus") != status
            or after.get("impliedPolicy") is not False
            or not policy_matches(after.get("policy"), bucket)
        ):
            raise ValueError("effective restriction verification failed")
    except Exception:
        # An ambiguous update/inspection must not leave a newly enabled account.
        # Supply policy on containment too; never use a status-only fallback.
        admin.update_service_account(access_key=access_key, status="off", policy=policy)
        raise RuntimeError(
            "account update failed; restricted disable requested"
        ) from None
    return {"policyVerified": True, "accountStatus": status, "getObjectOnly": True}
