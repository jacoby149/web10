from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app import settings
from app.main import app
from app.v3.services import clickhouse as ch


@pytest.mark.parametrize("case", ["expired", "foreign", "anon", "deleted", "revoked_client"])
def test_analytics_identity_denies_before_pseudonym_or_foreign_transport(case):
    payload = {
        "username": "alice",
        "provider": settings.PROVIDER,
        "site": "auth.localhost",
        "expires": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }
    if case == "expired":
        payload["expires"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    if case == "foreign":
        payload["provider"] = "foreign.invalid"
    if case == "anon":
        payload["username"] = "anon"
    if case == "revoked_client":
        payload["client_id"] = "revoked"
    token = jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
    with (
        patch.object(
            ch, "get_user", return_value=None if case == "deleted" else {"created_at": "2026-01-01T00:00:00Z"}
        ),
        patch.object(ch, "get_oauth_client", return_value=None),
        patch("app.services.product_analytics.account_id") as pseudonym,
        patch("app.services.auth.certify_with_remote_provider") as foreign,
    ):
        response = TestClient(app, raise_server_exceptions=False).post("/analytics/identity", json={"token": token})
    assert response.status_code != 200
    pseudonym.assert_not_called()
    foreign.assert_not_called()
