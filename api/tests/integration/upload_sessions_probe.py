"""Opt-in isolated MinIO probe, run directly (not under mocked pytest conftest).

PYTHONPATH=. UPLOAD_SESSION_TEST_ENDPOINT=http://127.0.0.1:<port> uv run --frozen python tests/integration/upload_sessions_probe.py
Use only a disposable MinIO with synthetic upload-probe/upload-probe-test-only credentials.
"""

import json
import os
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from uuid import uuid4

import boto3

from app.services.upload_sessions import SessionConflict, SessionMissing, UploadIntent, UploadOwner, UploadSessionStore

endpoint = os.environ["UPLOAD_SESSION_TEST_ENDPOINT"]
assert urlparse(endpoint).hostname in {"127.0.0.1", "localhost", "::1"}, "disposable loopback storage only"
s3 = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id="upload-probe",
    aws_secret_access_key="upload-probe-test-only",
    region_name="us-east-1",
)
bucket = "upload-session-probe-" + uuid4().hex
s3.create_bucket(Bucket=bucket)
owner = UploadOwner(node="test-node", issuer="test-issuer", username="alice", app_id="test-app")
intent = UploadIntent(filename="film.mp4", mime_type="video/mp4", size_bytes=1000)
store = UploadSessionStore(s3, bucket, media_bucket="unused-media")
try:
    sid = uuid4().hex
    reserved = store.reserve(owner, sid, intent)
    assert store.reserve(owner, sid, intent) == reserved, "create-only writes not enforced"
    active = store.advance(owner, sid, reserved.revision, "uploading", upload_id="synthetic-multipart-id")
    barrier = threading.Barrier(2)

    class ConcurrentReads:
        def get_object(self, **kwargs):
            response = s3.get_object(**kwargs)
            barrier.wait(timeout=10)
            return response

        def put_object(self, **kwargs):
            return s3.put_object(**kwargs)

    racing = UploadSessionStore(ConcurrentReads(), bucket, media_bucket="unused-media")

    def claim(target):
        try:
            return racing.advance(owner, sid, active.revision, target).phase
        except SessionConflict:
            return "conflict"

    with ThreadPoolExecutor(2) as pool:
        outcomes = list(pool.map(claim, ["completing", "aborting"]))
    assert outcomes.count("conflict") == 1, outcomes
    assert store.get(owner, sid).phase in {"completing", "aborting"}
    for field in ("node", "issuer", "username", "app_id"):
        try:
            store.get(owner.model_copy(update={field: "foreign"}), sid)
        except SessionMissing:
            pass
        else:
            raise AssertionError("foreign owner read session")

    sid = uuid4().hex
    record = store.reserve(owner, sid, intent)
    for phase, extra in [
        ("uploading", {"upload_id": "synthetic-id"}),
        ("completing", {}),
        ("completed", {"object_etag": '"synthetic-object-etag"'}),
    ]:
        record = store.advance(owner, sid, record.revision, phase, **extra)
    env = {**os.environ, "PROBE_BUCKET": bucket, "PROBE_SESSION": sid, "PROBE_OWNER": owner.model_dump_json()}
    code = """
import boto3, os
from app.services.upload_sessions import UploadOwner, UploadSessionStore
s3 = boto3.client('s3', endpoint_url=os.environ['UPLOAD_SESSION_TEST_ENDPOINT'], aws_access_key_id='upload-probe', aws_secret_access_key='upload-probe-test-only', region_name='us-east-1')
record = UploadSessionStore(s3, os.environ['PROBE_BUCKET'], media_bucket='unused-media').get(UploadOwner.model_validate_json(os.environ['PROBE_OWNER']), os.environ['PROBE_SESSION'])
assert record.phase == 'completed' and record.object_etag == '\"synthetic-object-etag\"'
print('PASS: completed result recovered in a fresh Python process')
"""
    subprocess.run([sys.executable, "-c", code], env=env, check=True)
    print(
        json.dumps(
            {
                "result": "PASS",
                "race_outcomes": outcomes,
                "conditional_create": True,
                "owner_partitions": 4,
                "scope": "session records only; no actual multipart bytes or endpoint auth",
            }
        )
    )
finally:
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        for item in page.get("Contents", []):
            s3.delete_object(Bucket=bucket, Key=item["Key"])
    s3.delete_bucket(Bucket=bucket)
