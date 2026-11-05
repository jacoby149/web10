"""Disposable real FastAPI/ClickHouse floor for people-tag CRUD and query shapes.

Run from api/: PYTHONPATH=. uv run --frozen python ../marketing/web10-social/screenshots/mentions-api.py
No production connections, existing containers, browser auth or P2P transport.
"""
import json
import logging
import os
from pathlib import Path
import re
import secrets
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
NAME = f"web10-brussels-mentions-{secrets.token_hex(4)}"
checks = []


def docker(*args, **kwargs):
    return subprocess.run(["docker", *args], check=True, capture_output=True, text=True, **kwargs).stdout.strip()


started = False
try:
    docker("run", "-d", "--name", NAME, "--label", "web10-test=people-tags-brussels",
           "-p", "127.0.0.1::8123", "-e", "CLICKHOUSE_USER=web10", "-e", "CLICKHOUSE_PASSWORD=web10",
           "-e", "CLICKHOUSE_DB=web10", "--ulimit", "nofile=262144:262144", "clickhouse/clickhouse-server:24.8")
    started = True
    port = docker("port", NAME, "8123/tcp").rsplit(":", 1)[1]
    os.environ.update(CLICKHOUSE_HOST="127.0.0.1", CLICKHOUSE_PORT=port, CLICKHOUSE_DATABASE="web10",
                     CLICKHOUSE_USER="web10", CLICKHOUSE_PASSWORD="web10", PROVIDER="mentions.localhost",
                     PRIVATE_KEY=secrets.token_hex(32), VERIFY_REQUIRED="false", BETA_REQUIRED="false",
                     STRIPE_STATUS="test", S3_ENDPOINT="http://127.0.0.1:1", S3_PUBLIC_ENDPOINT="http://127.0.0.1:1")
    for attempt in range(100):
        try:
            docker("exec", NAME, "clickhouse-client", "--user", "web10", "--password", "web10", "-q", "SELECT 1")
            break
        except subprocess.CalledProcessError:
            if attempt == 99:
                raise
            time.sleep(0.2)
    for schema in sorted((ROOT / "clickhouse-init").glob("*.template")):
        # The image briefly restarts its bootstrap server after user setup.
        for attempt in range(100):
            try:
                docker("exec", "-i", NAME, "clickhouse-client", "--user", "web10", "--password", "web10", "--database", "web10", "--multiquery", input=schema.read_text())
                break
            except subprocess.CalledProcessError as error:
                if error.returncode != 210 or attempt == 99:
                    print(error.stderr)
                    raise
                time.sleep(0.2)

    from fastapi.testclient import TestClient
    from app.main import app
    from app.v3.services import clickhouse as ch
    logging.getLogger().setLevel(logging.WARNING)
    # Explicit schema/node initialization, without storage/HLS/background workers.
    ch.ensure_apps_schema()
    ch.ensure_users_domain_schema()
    ch.ensure_discover_group()
    client = TestClient(app)

    def post(path, data, expected=200):
        response = client.post(path, json=data)
        assert response.status_code == expected, f"{path}: {response.status_code}, expected {expected}"
        return response.json()

    def login(username):
        post("/v3/signup", {"username": username, "password": "synthetic-people-tags-password"})
        return post("/v3/login", {"username": username, "password": "synthetic-people-tags-password"})["token"]

    alice, bob = login("alice"), login("bob")
    roles = [{"name": "owner", "permissions": {"*": ["create", "readAll", "updateOwn", "deleteOwn"], "group": ["assignRoles", "revokeRoles"]}},
             {"name": "reader", "permissions": {"posts": ["readAll"], "comments": ["readAll"], "profile": ["readAll"]}}]

    def group(name, public=False):
        gid = post("/v3/groups/create", {"token": bob, "name": name, "join_policy": "closed", "roles": roles, "members": []})["group_id"]
        if public:
            post("/v3/groups/members/add", {"token": bob, "group_id": gid, "member_key": "anyone", "role": "reader"})
        return gid

    public, private = group("public", True), group("private")
    profiles = group("followers", True)
    post("/v3/create", {"token": bob, "service": "profile", "groups": [profiles], "body": {"display_name": "Bob Music"}})
    directory = post("/v3/users/directory", {"token": alice, "limit": 100})
    assert any(user["username"] == "bob" for user in directory["users"])
    checks.append("actual readable directory includes the published person profile")

    def create(service, gid, text, post_id=None, parent=None):
        body = {"text": text, "mention_usernames": ["alice"] if "@alice" in text else []}
        if post_id:
            body.update(post_id=post_id, parent_id=parent)
        return post("/v3/create", {"token": bob, "service": service, "groups": [gid], "body": body, "ref_value": parent or post_id or ""})["doc_id"]

    doc = create("posts", public, "A song for @alice")
    comment = create("comments", public, "Come listen @alice", doc)
    reply1 = create("comments", public, "First direct reply", doc, comment)
    reply2 = create("comments", public, "Second direct reply", doc, comment)
    hidden = create("posts", private, "Private @alice")
    source = (ROOT / "marketing/web10-social/src/data/mentionNotifications.ts").read_text()
    columns = re.search(r"const columns = '([^\n]+)';", source)[1]
    queries = {}
    for kind, sql in re.findall(r"\['(post_mention|comment_mention|mention_reply)', `([^`]+)`\]", source):
        sql = sql.replace("${columns}", columns)
        for alias in ["c", "p"]:
            sql = sql.replace("${tagged('" + alias + "')}", f"has(JSONExtract({alias}.body, 'mention_usernames', 'Array(String)'), 'alice')")
        queries[kind] = sql
    assert len(queries) == 3
    expected = {"post_mention": {doc}, "comment_mention": {comment}, "mention_reply": {reply1, reply2}}
    for kind, sql in queries.items():
        result = post("/v3/query", {"token": alice, "groups": [public], "sql": sql})
        assert {row["doc_id"] for row in result["rows"]} == expected[kind], kind
        checks.append(f"actual source {kind} query returns its exact persisted events")
    post("/v3/query", {"token": alice, "groups": [private], "sql": queries["post_mention"]}, 403)
    checks.append("tagging alone does not grant access to a private post")
    post("/v3/groups/members/add", {"token": bob, "group_id": private, "member_key": "alice", "role": "reader"})
    assert [row["doc_id"] for row in post("/v3/query", {"token": alice, "groups": [private], "sql": queries["post_mention"]})["rows"]] == [hidden]
    post("/v3/groups/members/remove", {"token": bob, "group_id": private, "member_key": "alice"})
    post("/v3/query", {"token": alice, "groups": [private], "sql": queries["post_mention"]}, 403)
    checks.append("shared-private grant permits lookup; current revocation denies it again")
    post("/v3/update", {"token": bob, "doc_id": comment, "body": {"text": "Tag removed", "mention_usernames": []}})
    assert post("/v3/query", {"token": alice, "groups": [public], "sql": queries["mention_reply"]})["rows"] == []
    checks.append("removing the parent tag removes direct-reply derivation on a fresh read")
    receipt = {"checks": checks, "storage": "real disposable ClickHouse 24.8", "transport": "real FastAPI ASGI, no Origin/app-contract or browser-auth claim", "limits": "not connected P2P, OS push or production", "cleanup": "pending"}
finally:
    if started:
        docker("rm", "-f", NAME)
        assert NAME not in docker("ps", "-a", "--format", "{{.Names}}", "--filter", f"name=^{NAME}$")
        print("[mentions-api] disposable container removed")

receipt["cleanup"] = "verified removed"
output = ROOT / ".context/mentions-api-receipt.json"
output.write_text(json.dumps(receipt, indent=2) + "\n")
for check in checks:
    print("[mentions-api] PASS", check)
