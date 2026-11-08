#!/usr/bin/env python3
"""Small-stack allow/deny/revoke/delete controls, never part of timed traffic."""
import argparse
import asyncio
import json
from pathlib import Path
import uuid

import httpx

import dataset_v2


async def controls(base, manifest):
    checks = []
    async with httpx.AsyncClient(base_url=base, timeout=120, trust_env=False) as client:
        async def call(path, body, status=200, origin=None):
            response = await client.post("/v3/" + path, json=body, headers={"Origin": origin} if origin else {})
            if response.status_code != status:
                raise ValueError(f"lifecycle {path}: expected {status}, got {response.status_code}")
            return response.json()

        owner = dataset_v2.creator(manifest["recipe"], 0)
        owner_token = (await call("login", {"username": owner, "password": dataset_v2.PASSWORD, "site": "costfn"}))["token"]
        reader_token = (await call("login", {"username": manifest["reader"], "password": dataset_v2.PASSWORD, "site": "costfn"}))["token"]
        origin = "https://lifecycle.research.invalid"
        perms = {s: ["readAll"] for s in dataset_v2.SERVICES}
        await call("app-contracts/add", {"token": reader_token, "allowed_origin": origin, "permissions": perms})
        gid = (await call("groups/create", {"token": owner_token, "name": "research-private-" + uuid.uuid4().hex[:12],
            "join_policy": "closed", "roles": [{"name": "owner", "permissions": {"posts": ["readAll", "create", "deleteOwn", "updateOwn"],
                "group": ["assignRoles", "revokeRoles", "manageRoles", "deleteGroup"]}}, {"name": "reader", "permissions": {"posts": ["readAll"]}}],
            "members": []}))["group_id"]
        created = await call("create", {"token": owner_token, "service": "posts", "body": {"text": "Private lifecycle fixture"}, "groups": [gid]})
        doc = created["doc_id"]
        query = {"token": reader_token, "sql": "SELECT doc_id, body FROM posts ORDER BY doc_id", "groups": [gid]}
        try:
            await call("query", query, 403, origin)
            checks.append("private_nonmember_denied")
            await call("groups/members/add", {"token": owner_token, "group_id": gid, "member_key": manifest["reader"], "role": "reader"})

            async def exact():
                result = await call("query", query, origin=origin)
                if result["rows"] != [{"doc_id": doc, "body": {"text": "Private lifecycle fixture"}}]:
                    raise ValueError("private allowed result differs")

            await exact()
            checks.append("private_grant_exact_result")
            await call("app-contracts/revoke", {"token": reader_token, "allowed_origin": origin})
            await call("query", query, 403, origin)
            checks.append("app_revoke_denied")
            await call("app-contracts/add", {"token": reader_token, "allowed_origin": origin, "permissions": perms})
            await exact()
            checks.append("app_regrant_exact_result")
            await call("groups/members/remove", {"token": owner_token, "group_id": gid, "member_key": manifest["reader"]})
            await call("query", query, 403, origin)
            checks.append("membership_revoke_denied")
            await call("groups/members/add", {"token": owner_token, "group_id": gid, "member_key": manifest["reader"], "role": "reader"})
            await exact()
            checks.append("membership_regrant_exact_result")
            await call("delete", {"token": owner_token, "service": "posts", "doc_id": doc})
            result = await call("query", query, origin=origin)
            if result["rows"]:
                raise ValueError("deleted private document resurfaced")
            checks.append("document_tombstone_denied")
        finally:
            await call("app-contracts/revoke", {"token": reader_token, "allowed_origin": origin})
            await call("groups/delete", {"token": owner_token, "group_id": gid})
    return {"passed": checks, "complete": len(checks) == 7,
            "scope": "Real synthetic API/DB lifecycle; direct authenticator contract setup, not browser consent. Run before and after load; use a fresh restore for each point."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    verified = dataset_v2.validate(args.directory)
    receipt = json.loads(args.receipt.read_bytes())
    if receipt.get("dataset_id") != verified["dataset_id"] or not receipt.get("complete") or receipt["api"] != f"http://127.0.0.1:{receipt['api_port']}":
        raise ValueError("matching disposable local restore required")
    if args.out.exists():
        raise FileExistsError("refusing to overwrite lifecycle receipt")
    result = asyncio.run(controls(receipt["api"], json.loads((args.directory / "manifest.json").read_bytes())))
    with args.out.open("x") as stream:
        json.dump(result, stream, indent=2)
