"""Synthetic HTTP scenario, executed inside node B's isolated container."""

import json
import os
import sys

import jwt
import requests

from app.v3.services import clickhouse as ch

A, B = "http://api-a", "http://api-b"
FOREIGN = "node-a.federation.test/users/alice"
ORIGIN = "https://demo-app.example"
session = requests.Session()
session.trust_env = False
events = []
checks = []
phase = "setup"


def failure(kind, error, trace):
    print(json.dumps({"result": "failed", "events": events, "checks": checks}), flush=True)
    sys.__excepthook__(kind, error, trace)


sys.excepthook = failure


def post(node, path, data, expected=200):
    response = session.post(node + path, json=data, timeout=30)
    events.append({"phase": phase, "node": node, "path": path, "status": response.status_code})
    assert response.status_code == expected, f"{node}{path}: status {response.status_code}, expected {expected}"
    return response.json()


def login(node, username):
    post(
        node,
        "/v3/signup",
        {"username": username, "password": "synthetic-demo-password"},
    )
    return post(node, "/v3/login", {"username": username, "password": "synthetic-demo-password"})["token"]


alice = login(A, "alice")
bob = login(B, "bob")
post(B, "/v3/login", {"username": "alice", "password": "synthetic-demo-password"}, 401)
assert ch.get_user("alice") is None, "foreign reads must not register the home user on B"
try:
    jwt.decode(alice, os.environ["PRIVATE_KEY"], algorithms=["HS256"])
    raise AssertionError("A and B must have independent signing keys")
except jwt.InvalidSignatureError:
    pass
post(B, "/certify", {"token": alice}, 401)  # issuer endpoint must never forward
roles = [
    {
        "name": "owner",
        "permissions": {
            "group": ["assignRoles", "revokeRoles"],
            "notes": ["create", "readAll"],
        },
    },
    {"name": "reader", "permissions": {"notes": ["readAll"]}},
]
group = post(
    B,
    "/v3/groups/create",
    {
        "token": bob,
        "name": "demo",
        "join_policy": "closed",
        "roles": roles,
        "members": [],
    },
)["group_id"]
post(B, "/v3/groups/list", {"token": bob})
members = post(B, "/v3/groups/members/list", {"token": bob, "group_id": group})
assert [m["member_key"] for m in members] == ["bob"], "listing must not create a duplicate owner"
doc = post(
    B,
    "/v3/create",
    {
        "token": bob,
        "service": "notes",
        "groups": [group],
        "body": {"text": "synthetic-cross-node-record"},
    },
)["doc_id"]


def read_pair(name, allowed):
    global phase
    phase = name
    for path, extra in [
        ("/v3/read", {"service": "notes"}),
        ("/v3/query", {"sql": "SELECT doc_id FROM notes", "withGroupMeta": False}),
    ]:
        data = post(
            B,
            path,
            {"token": alice, "groups": [group], **extra},
            200 if allowed else 403,
        )
        if allowed:
            rows = data if isinstance(data, list) else data["rows"]
            assert [row["doc_id"] for row in rows] == [doc]
    checks.append(
        {
            "phase": phase,
            "allowed": allowed,
            "returned_doc_ids": [doc] if allowed else [],
            "same_jwt_used": True,
        }
    )


read_pair("before-grant", False)  # first home certification succeeds; B still denies access
local_alice = login(B, "alice")  # distinct, deliberately same-named local fixture
post(
    B,
    "/v3/groups/members/add",
    {"token": bob, "group_id": group, "member_key": "alice", "role": "reader"},
)
read_pair("namesake-only", False)  # foreign Alice cannot borrow B's Alice membership
post(
    B,
    "/v3/groups/members/add",
    {"token": bob, "group_id": group, "member_key": FOREIGN, "role": "reader"},
)
read_pair("foreign-granted", True)

# A local namesake's app grant is insufficient. Foreign app enrollment is a
# labelled setup fixture, NOT browser consent or a completed Phase C claim.
post(
    B,
    "/v3/app-contracts/add",
    {
        "token": local_alice,
        "allowed_origin": ORIGIN,
        "permissions": {"notes": ["readAll"]},
    },
)


def app_read(expected):
    response = session.post(
        B + "/v3/query",
        json={"token": alice, "groups": [group], "sql": "SELECT doc_id FROM notes"},
        headers={"Origin": ORIGIN},
        timeout=30,
    )
    events.append(
        {
            "node": B,
            "path": "/v3/query",
            "origin_gate": True,
            "status": response.status_code,
        }
    )
    assert response.status_code == expected
    if expected == 200:
        assert [row["doc_id"] for row in response.json()["rows"]] == [doc]


app_read(403)
ch.add_app_contract(FOREIGN, ORIGIN, {"notes": ["readAll"]})
checks.append({"phase": "foreign-app-granted", "fixture": "service function, not browser consent"})
app_read(200)
ch.revoke_app_contract(FOREIGN, ORIGIN)
checks.append({"phase": "foreign-app-revoked", "fixture": "service function, not browser consent"})
app_read(403)
read_pair("app-revoked-group-retained", True)  # independent direct/group authority remains intact
post(
    B,
    "/v3/groups/members/remove",
    {"token": bob, "group_id": group, "member_key": FOREIGN},
)
read_pair("foreign-removed", False)  # same JWT's cached identity grants no surviving B access
post(
    B,
    "/v3/groups/members/add",
    {"token": bob, "group_id": group, "member_key": FOREIGN, "role": "reader"},
)
read_pair("foreign-regranted", True)

# A foreign-provider JWT signed with B's own key must still be denied by A.
claims = jwt.decode(alice, options={"verify_signature": False})
forged = jwt.encode(claims, os.environ["PRIVATE_KEY"], algorithm="HS256")
for _ in range(2):
    post(B, "/v3/read", {"token": forged, "service": "notes", "groups": [group]}, 401)
assert ch.get_user(FOREIGN) is None
print(
    json.dumps(
        {
            "result": "passed",
            "events": events,
            "checks": checks,
            "group_id": group,
            "doc_id": doc,
            "foreign_app_grant_and_revoke": "setup fixtures",
            "signing_keys": "independent",
        }
    )
)
