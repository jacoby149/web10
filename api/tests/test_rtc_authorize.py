"""RTC admission derives identities only from verified local session claims."""

import logging
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.services.auth import decode_token


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        with TestClient(fastapi_app, raise_server_exceptions=False) as client:
            yield client


@pytest.mark.parametrize("label", ["", "messages", "A_z-09", "x" * 64])
def test_valid_identity(client, valid_token, valid_token_payload, label):
    response = client.post("/rtc/authorize", json={"token": valid_token, "label": label})
    payload = valid_token_payload
    expected = f"{payload['provider']} {payload['username']} {payload['site']} {label}".replace(".", "_")
    assert response.status_code == 200
    assert response.json() == {"peer_id": expected}


@pytest.mark.parametrize("site", [None, ""])
def test_site_fallback(client, valid_token_payload, site):
    payload = {**valid_token_payload, "site": site}
    token = jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
    response = client.post("/rtc/authorize", json={"token": token, "label": ""})
    assert response.status_code == 200
    assert response.json() == {"peer_id": f"{payload['provider']} testuser web10 ".replace(".", "_")}


def test_labels_do_not_collide(client, valid_token):
    ids = []
    for label in ("", "a-b", "a_b", "ab", "AB"):
        response = client.post("/rtc/authorize", json={"token": valid_token, "label": label})
        assert response.status_code == 200
        ids.append(response.json()["peer_id"])
    assert len(set(ids)) == len(ids)


@pytest.mark.parametrize("label", ["a b", "a\tb", "a\nb", "a\u00a0b", "a.b", "a/b", "x" * 65, None, 1])
def test_invalid_label(client, valid_token, label):
    assert client.post("/rtc/authorize", json={"token": valid_token, "label": label}).status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"label": ""},
        {"token": "", "label": ""},
        {"token": None, "label": ""},
        {"token": 1, "label": ""},
        {"token": "some-token"},
    ],
)
def test_missing_or_invalid_fields(client, body):
    assert client.post("/rtc/authorize", json=body).status_code == 422


@pytest.mark.parametrize(
    "field,value",
    [
        ("username", None),
        ("username", ""),
        ("username", 1),
        ("username", []),
        ("username", "test user"),
        ("username", "test\tuser"),
        ("username", "test\nuser"),
        ("username", "test\u00a0user"),
        ("provider", None),
        ("provider", ""),
        ("provider", 1),
        ("provider", "node host"),
        ("provider", "node\thost"),
        ("provider", "node\nhost"),
        ("site", 0),
        ("site", False),
        ("site", []),
        ("site", {}),
        ("site", "auth host"),
        ("site", "auth\thost"),
        ("site", "auth\nhost"),
        ("site", "auth\u00a0host"),
    ],
)
def test_malformed_identity(client, valid_token_payload, field, value):
    payload = {**valid_token_payload, field: value}
    token = jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
    assert client.post("/rtc/authorize", json={"token": token, "label": ""}).status_code == 401


@pytest.mark.parametrize("fixture", ["expired_token", "anon_token"])
def test_expired_or_anonymous(client, request, fixture):
    token = request.getfixturevalue(fixture)
    assert client.post("/rtc/authorize", json={"token": token, "label": ""}).status_code == 401


def test_malformed_token(client):
    assert client.post("/rtc/authorize", json={"token": "not-a-jwt", "label": ""}).status_code == 401


@pytest.mark.parametrize("kind", ["forged", "cross-provider", "unsigned"])
def test_no_unsigned_trust_or_provider_fetch(client, valid_token_payload, kind):
    payload = dict(valid_token_payload)
    if kind == "cross-provider":
        payload["provider"] = "attacker.example"
    token = jwt.encode(
        payload,
        "" if kind == "unsigned" else "wrong-key-for-forgery-long-enough" if kind == "forged" else settings.PRIVATE_KEY,
        algorithm="none" if kind == "unsigned" else settings.ALGORITHM,
    )
    with (
        patch("app.services.auth.decode_token", wraps=decode_token) as decoder,
        patch("app.endpoints.system.decode_token", wraps=decode_token) as endpoint_decoder,
        patch("app.services.auth.requests.post") as post,
        patch("app.services.auth.requests.get") as get,
    ):
        response = client.post("/rtc/authorize", json={"token": token, "label": ""})
    assert response.status_code == 401
    assert decoder.call_count == 1
    assert all(call.kwargs.get("private_key") is True for call in decoder.call_args_list)
    endpoint_decoder.assert_not_called()
    post.assert_not_called()
    get.assert_not_called()


def test_verified_decode_and_safe_outcome_logs(client, valid_token, caplog):
    with (
        caplog.at_level(logging.INFO, logger="app.endpoints.system"),
        patch("app.endpoints.system.decode_token", wraps=decode_token) as decoder,
    ):
        assert client.post("/rtc/authorize", json={"token": valid_token, "label": ""}).status_code == 200
        assert client.post("/rtc/authorize", json={"token": "bad-credential", "label": ""}).status_code == 401
    decoder.assert_called_once_with(valid_token, private_key=True)
    messages = [record.getMessage() for record in caplog.records if record.name == "app.endpoints.system"]
    assert "[rtc-authorize] authorized signaling identity" in messages
    assert "[rtc-authorize] denied: invalid session" in messages
    assert all(valid_token not in message and "bad-credential" not in message for message in messages)
