"""Synthetic API fixtures; no pre-created domain follow or verified alias."""

import json
from pathlib import Path

import requests

session = requests.Session()
session.trust_env = False
config = json.loads(Path("/domain-config.json").read_text())


def post(node, path, data):
    response = session.post("http://api-" + node + path, json=data, timeout=30)
    assert response.status_code == 200, f"{path}: status {response.status_code}"
    return response.json()


def login(node, username):
    post(node, "/v3/signup", {"username": username, "password": "synthetic-demo-password"})
    return post(node, "/v3/login", {"username": username, "password": "synthetic-demo-password"})["token"]


for case in config["cases"]:
    fan = login("b", case["reader"])
    # Explicit direct-API fixture, not a browser app-consent result.
    post(
        "b",
        "/v3/app-contracts/add",
        {
            "token": fan,
            "allowed_origin": config["origin"],
            "permissions": {"domain-demo-follows": ["create", "readAll"]},
        },
    )
    for node in ("a", "b"):
        owner = login(node, case[node])
        for public in (True, False):
            service = {"posts": ["create", "readAll"], "group": ["assignRoles"]}
            group = post(
                node,
                "/v3/groups/create",
                {
                    "token": owner,
                    "name": "domain-demo-public" if public else "domain-demo-private",
                    "join_policy": "closed",
                    "roles": [
                        {"name": "owner", "permissions": service},
                        {"name": "reader", "permissions": {"posts": ["readAll"]}},
                    ],
                    "members": [{"member_key": "anyone", "role": "reader"}] if public else [],
                },
            )["group_id"]
            if node == "a" and not public:
                post(
                    node,
                    "/v3/groups/members/add",
                    {
                        "token": owner,
                        "group_id": group,
                        "member_key": f"node-b.federation.test/users/{case['reader']}",
                        "role": "reader",
                    },
                )
            text = (
                ("Before the move. Same website." if node == "a" else "New account. Same audience.")
                if public
                else "PRIVATE CONTROL: must never appear"
            )
            post(node, "/v3/create", {"token": owner, "service": "posts", "groups": [group], "body": {"text": text}})
print("Synthetic accounts/posts and explicit reader app grants created; zero follows or domain claims seeded.")
