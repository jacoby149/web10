"""Route/helper SQL replay on SQLite, not ClickHouse or remote issuer proof."""

import json
import re
import sqlite3
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import settings
from app.services import auth
from app.v3.endpoints.contracts import router
from app.v3.services import clickhouse as ch
from tests.test_foreign_self_membership import FOREIGN, credential

APP = "https://social.example"
AUTH = "https://auth.home.example"
PERMISSIONS = {"posts": ["readAll"]}
GRANTS = [(APP, ""), ("", "delegated-app"), ("", "other-delegated-app")]


class SQLReplay:
    def __init__(self):
        self.db = sqlite3.connect(":memory:", check_same_thread=False)
        self.db.execute(
            "CREATE TABLE app_contracts (user_key TEXT, allowed_origin TEXT, permissions TEXT, "
            "created_at INT, updated_at INT, deleted INT, client_id TEXT DEFAULT '')"
        )

    def execute(self, sql, params):
        # Preserve helper SQL; substitute only parameters and the server clock.
        sql = re.sub(r"%\((\w+)\)s", r":\1", sql.replace("now64(6)", "100"))
        return self.db.execute(sql, params or {})

    def command(self, sql, params=None):
        self.execute(sql, params)

    def query(self, sql, params=None):
        return SimpleNamespace(result_rows=self.execute(sql, params).fetchall())


@pytest.mark.parametrize("local", [False, True])
@pytest.mark.parametrize("target", ["all", "origin", "client"])
def test_registered_revoke_preserves_grant_keys_and_principal_scope(local, target):
    owner = "alice" if local else FOREIGN
    other = FOREIGN if local else "alice"
    replay = SQLReplay()
    app = FastAPI()
    app.include_router(router, prefix="/v3/app-contracts")
    for user in (owner, other):
        for origin, client_id in GRANTS:
            replay.db.execute(
                "INSERT INTO app_contracts VALUES (?, ?, ?, 1, 1, 0, ?)",
                (user, origin, json.dumps(PERMISSIONS), client_id),
            )
    body = {"token": credential(local=local)}
    if target == "origin":
        body["allowed_origin"] = APP
    elif target == "client":
        body["client_id"] = "delegated-app"
    auth.clear_remote_certify_cache()
    try:
        with (
            patch.object(settings, "CORS_SERVICE_MANAGERS", ["auth.home.example"]),
            patch.object(auth, "certify_with_remote_provider", return_value=True),
            patch.object(ch, "client", replay),
            TestClient(app) as client,
        ):
            for user in (owner, other):
                for origin, client_id in GRANTS:
                    assert ch.get_app_permissions(user, origin, client_id=client_id) == PERMISSIONS
            response = client.post("/v3/app-contracts/revoke", headers={"Origin": AUTH}, json=body)
            assert response.status_code == 200
            assert response.json() == {"status": "revoked"}
            for origin, client_id in GRANTS:
                revoked = target == "all" or (target == "origin" and origin == APP)
                revoked = revoked or (target == "client" and client_id == "delegated-app")
                assert ch.get_app_permissions(owner, origin, client_id=client_id) == ({} if revoked else PERMISSIONS), (
                    local,
                    target,
                    origin,
                    client_id,
                )
                assert ch.get_app_permissions(other, origin, client_id=client_id) == PERMISSIONS
    finally:
        auth.clear_remote_certify_cache()
        replay.db.close()
