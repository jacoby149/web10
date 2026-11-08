"""Actual HTTP/auth/DNS parsing with synthetic DNS and account storage."""

import sqlite3
from types import SimpleNamespace
from unittest.mock import Mock

import dns.exception
import dns.resolver
import jwt
import pytest
from fastapi.testclient import TestClient

from app import settings
from app.main import app
from app.v3.services import clickhouse as ch
from app.v3.services import domains


@pytest.fixture
def env(monkeypatch):
    state = {"domain": None, "verified": False}
    monkeypatch.setattr(ch, "get_user", Mock(return_value={"username": "testuser"}))
    monkeypatch.setattr(ch, "get_user_domain", Mock(side_effect=lambda _: dict(state)))
    monkeypatch.setattr(ch, "domain_claimed_by_other", Mock(return_value=False))
    monkeypatch.setattr(
        ch, "set_domain", Mock(side_effect=lambda u, d, v: state.update(domain=d or None, verified=bool(v)))
    )
    record = SimpleNamespace(strings=[f"web10.v=1;provider={settings.PROVIDER};".encode(), b"user=testuser"])
    resolver = Mock()
    resolver.resolve.return_value = [record]
    monkeypatch.setattr(domains.dns.resolver, "Resolver", Mock(return_value=resolver))
    return TestClient(app, raise_server_exceptions=False), state, resolver


def test_claim_lookup_release(env, valid_token):
    client, state, resolver = env
    data = {"token": valid_token, "domain": "EXAMPLE.COM."}
    result = client.post("/v3/domains/verify", json=data)
    assert result.status_code == 200, result.text
    assert result.json() == {
        "domain": "example.com",
        "verified": True,
        "provider": settings.PROVIDER,
        "user": "testuser",
    }
    resolver.resolve.assert_called_once_with("web10.example.com.", "TXT", lifetime=5.0, search=False)
    assert resolver.timeout == 2.0
    assert client.get("/v3/users/testuser/domain").json() == {"username": "testuser", **state}
    assert client.post("/v3/domains/release", json=data).json() == {"domain": "example.com", "released": True}
    assert client.get("/v3/users/testuser/domain").json() == {"username": "testuser", "domain": None, "verified": False}


@pytest.mark.parametrize(
    "error,code",
    [
        (dns.resolver.NXDOMAIN(), "txt_record_not_found"),
        (dns.resolver.NoAnswer(), "txt_record_not_found"),
        (dns.exception.Timeout(), "dns_timeout"),
        (dns.resolver.NoNameservers(), "dns_error"),
    ],
)
def test_dns_errors_http(env, valid_token, error, code):
    client, _, resolver = env
    resolver.resolve.side_effect = error
    response = client.post("/v3/domains/verify", json={"token": valid_token, "domain": "example.com"})
    assert response.status_code == 400
    assert response.json() == {"domain": "example.com", "verified": False, "error": code}
    ch.set_domain.assert_not_called()


@pytest.mark.parametrize(
    "records,code",
    [
        (["unrelated"], "txt_record_not_found"),
        (["web10.v=2;provider=x;user=y"], "bad_format"),
        (["web10.v=1;provider=x;user=testuser"], "wrong_provider"),
        ([f"web10.v=1;provider={settings.PROVIDER};user=other"], "wrong_user"),
        ([f"web10.v=1;provider={settings.PROVIDER};user=testuser;key=old"], "bad_format"),
        ([f"web10.v=1;provider={settings.PROVIDER};user=testuser;user=other"], "bad_format"),
        (["web10.v=1;provider=x;user=y"] * 2, "multiple_claims"),
        ([f"web10.v=1;provider={settings.PROVIDER};user=testuser", "web10.v=1;provider=x;user=y"], "multiple_claims"),
    ],
)
def test_claim_parsing_http(env, valid_token, records, code):
    client, _, resolver = env
    resolver.resolve.return_value = [SimpleNamespace(strings=[r.encode()]) for r in records]
    response = client.post("/v3/domains/verify", json={"token": valid_token, "domain": "example.com"})
    assert response.status_code == 400
    assert response.json()["error"] == code
    ch.set_domain.assert_not_called()


@pytest.mark.parametrize(
    "domain",
    [
        "localhost",
        "127.0.0.1",
        "::1",
        "https://example.com",
        "example.com/a",
        "example.com:53",
        "a..com",
        "-a.com",
        "a_.com",
        " example.com",
        "example.com..",
        "a." + "x" * 64,
        "example.com?x=1",
    ],
)
def test_invalid_domain_http(env, valid_token, domain):
    client, _, resolver = env
    response = client.post("/v3/domains/verify", json={"token": valid_token, "domain": domain})
    assert response.status_code == 400
    assert response.json() == {"detail": "invalid_domain"}
    resolver.resolve.assert_not_called()


def test_idna():
    assert domains.normalize_domain("b\u00fccher.example") == "xn--bcher-kva.example"
    with pytest.raises(ValueError):
        domains.normalize_domain("xn--.example")


@pytest.mark.parametrize("endpoint", ["verify", "release"])
@pytest.mark.parametrize("kind", ["missing", "bad", "expired", "anon", "foreign", "inactive", "revoked_client"])
def test_auth_denied_before_dns(env, valid_token, expired_token, anon_token, valid_token_payload, endpoint, kind):
    client, _, resolver = env
    token = {"missing": None, "bad": "bad", "expired": expired_token, "anon": anon_token}.get(kind, valid_token)
    if kind == "foreign":
        token = jwt.encode(
            {**valid_token_payload, "provider": "foreign.example"}, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM
        )
    if kind == "inactive":
        ch.get_user.return_value = None
    if kind == "revoked_client":
        token = jwt.encode(
            {**valid_token_payload, "client_id": "revoked"}, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM
        )
        from unittest.mock import patch

        with patch.object(ch, "get_oauth_client", return_value=None):
            response = client.post(f"/v3/domains/{endpoint}", json={"token": token, "domain": "example.com"})
    else:
        response = client.post(f"/v3/domains/{endpoint}", json={"token": token, "domain": "example.com"})
    assert response.status_code == 401, response.text
    resolver.resolve.assert_not_called()
    ch.set_domain.assert_not_called()


def test_conflicts_and_release_mismatch(env, valid_token):
    client, state, resolver = env
    data = {"token": valid_token, "domain": "example.com"}
    state.update(domain="old.example", verified=True)
    assert client.post("/v3/domains/verify", json=data).json()["error"] == "release_required"
    assert client.post("/v3/domains/release", json=data).json() == {"detail": "domain_mismatch"}
    state.update(domain=None, verified=False)
    ch.domain_claimed_by_other.return_value = True
    assert client.post("/v3/domains/verify", json=data).json()["error"] == "domain_taken"
    resolver.resolve.assert_not_called()
    ch.set_domain.assert_not_called()


def test_no_username_authority(env, valid_token):
    client, _, resolver = env
    assert (
        client.post(
            "/v3/domains/verify", json={"token": valid_token, "domain": "example.com", "username": "victim"}
        ).status_code
        == 422
    )
    resolver.resolve.assert_not_called()


@pytest.mark.parametrize(
    "mutation,args",
    [
        ("change_password", ("new-hash",)),
        ("change_phone", ("new-phone",)),
        ("set_email", ("new-email",)),
        ("verify_phone", ()),
        ("verify_email", ()),
        ("set_domain", ("new.example", 1)),
    ],
)
def test_row_copy_preserves_latest_account_sql(monkeypatch, mutation, args):
    db = sqlite3.connect(":memory:")
    db.create_function("toDateTime64", 2, lambda value, precision: value)
    db.create_function("addMilliseconds", 2, lambda value, delta: str(float(value) + delta / 1000))
    db.create_function("greatest", 2, max)
    db.execute(
        "CREATE TABLE users (username, password_hash, phone, phone_verified, email, email_verified, domain, domain_verified, created_at, updated_at, deleted, analytics_context)"
    )
    db.executemany(
        "INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            ("alice", "old", "old", 0, "old", 0, "stale.example", 1, "0", "1", 0, "{}"),
            (
                "alice",
                "current-hash",
                "current-phone",
                1,
                "current-email",
                1,
                "current.example",
                1,
                "0",
                "2",
                0,
                '{"event_id":"retained"}',
            ),
        ],
    )

    def command(sql, params):
        import re

        db.execute(re.sub(r"%\((\w+)\)s", r":\1", sql), params)

    monkeypatch.setattr(ch, "client", SimpleNamespace(command=command))
    getattr(ch, mutation)("alice", *args)
    assert db.execute("SELECT count(*) FROM users").fetchone()[0] == 3
    assert (
        db.execute("SELECT analytics_context FROM users ORDER BY rowid DESC LIMIT 1").fetchone()[0]
        == '{"event_id":"retained"}'
    )
    row = db.execute(
        "SELECT password_hash, phone, email, domain, domain_verified FROM users ORDER BY rowid DESC LIMIT 1"
    ).fetchone()
    assert row == (
        "new-hash" if mutation == "change_password" else "current-hash",
        "new-phone" if mutation == "change_phone" else "current-phone",
        "new-email" if mutation == "set_email" else "current-email",
        "new.example" if mutation == "set_domain" else "current.example",
        1,
    )
    db.execute(
        "INSERT INTO users SELECT username,password_hash,phone,phone_verified,email,email_verified,domain,domain_verified,created_at,'9999',1,analytics_context FROM users LIMIT 1"
    )
    getattr(ch, mutation)("alice", *args)
    assert db.execute("SELECT count(*) FROM users").fetchone()[0] == 4


def test_uniqueness_current_rows_sql(monkeypatch):
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE users (username,domain,updated_at,deleted)")
    db.executemany(
        "INSERT INTO users VALUES (?,?,?,?)",
        [
            ("alice", "example.com", 1, 0),
            ("alice", "", 2, 0),
            ("bob", "example.com", 1, 0),
            ("bob", "example.com", 2, 1),
        ],
    )

    def query(sql, params):
        import re

        return SimpleNamespace(result_rows=db.execute(re.sub(r"%\((\w+)\)s", r":\1", sql), params).fetchall())

    monkeypatch.setattr(ch, "client", SimpleNamespace(query=query))
    assert not ch.domain_claimed_by_other("example.com", "new")
    db.execute("INSERT INTO users VALUES ('carol','example.com',3,0)")
    assert ch.domain_claimed_by_other("example.com", "new")
    assert not ch.domain_claimed_by_other("example.com", "carol")


def test_schema_migration_idempotent_statements(monkeypatch):
    client = Mock()
    monkeypatch.setattr(ch, "client", client)
    ch.ensure_users_domain_schema()
    assert client.command.call_count == 3
    assert all("ADD COLUMN IF NOT EXISTS" in call.args[0] for call in client.command.call_args_list)


def test_latest_domain_and_active_account_reads_sql(monkeypatch):
    import re

    db = sqlite3.connect(":memory:")
    db.execute(
        "CREATE TABLE users (username,password_hash,phone,phone_verified,email,email_verified,domain,domain_verified,created_at,updated_at,deleted)"
    )
    db.execute("INSERT INTO users VALUES ('alice','hash','',0,'',0,'old.example',1,'2026-01-01',1,0)")

    def query(sql, params):
        return SimpleNamespace(result_rows=db.execute(re.sub(r"%\((\w+)\)s", r":\1", sql), params).fetchall())

    monkeypatch.setattr(ch, "client", SimpleNamespace(query=query))
    assert ch.get_user_domain("missing") is None
    assert ch.get_user_domain("alice") == {"domain": "old.example", "verified": True}
    assert ch.get_user("alice")["username"] == "alice"
    db.execute(
        "INSERT INTO users SELECT username,password_hash,phone,phone_verified,email,email_verified,'',0,created_at,2,0 FROM users LIMIT 1"
    )
    assert ch.get_user_domain("alice") == {"domain": None, "verified": False}
    db.execute(
        "INSERT INTO users SELECT username,password_hash,phone,phone_verified,email,email_verified,domain,domain_verified,created_at,3,1 FROM users LIMIT 1"
    )
    assert ch.get_user_domain("alice") is None
    assert ch.get_user("alice") is None


def test_reverify_and_unrelated_txt(env, valid_token):
    client, state, resolver = env
    state.update(domain="example.com", verified=True)
    resolver.resolve.return_value.append(SimpleNamespace(strings=[b"unrelated=record"]))
    data = {"token": valid_token, "domain": "example.com"}
    assert client.post("/v3/domains/verify", json=data).status_code == 200
    resolver.resolve.side_effect = dns.exception.Timeout()
    assert client.post("/v3/domains/verify", json=data).json()["error"] == "dns_timeout"
    assert state == {"domain": "example.com", "verified": True}


@pytest.mark.parametrize("records", [[b"web10.v=1;" + b"x" * 4096], [b"web10.v=1;\xff"], [b"unrelated"] * 65])
def test_dns_bounded_response(env, valid_token, records):
    client, _, resolver = env
    resolver.resolve.return_value = [SimpleNamespace(strings=[r]) for r in records]
    response = client.post("/v3/domains/verify", json={"token": valid_token, "domain": "example.com"})
    assert response.status_code == 400
    assert response.json()["error"] == "bad_format"
    ch.set_domain.assert_not_called()


def test_public_missing_account(env):
    client, _, _ = env
    ch.get_user_domain.side_effect = None
    ch.get_user_domain.return_value = None
    assert client.get("/v3/users/missing/domain").json() == {"username": "missing", "domain": None, "verified": False}
