"""Regression test for PR #191 (CHANGELOG 1.0.107): the CORS trust boundary.

#191 changed a security boundary and shipped with no test. It did two things
that must not silently regress into each other's opposite:

  (a) Browser CORS was opened to ALL origins (`allow_origins=["*"]`, credentials
      OFF). web10 apps are stateless frontends anyone can build and host
      anywhere; the token rides in the request body, never a cookie, so an
      origin allow-list only broke legitimate apps without adding security.
      Re-locking CORS would break every third-party app.

  (b) The REAL trust list is `CORS_SERVICE_MANAGERS`: authenticator hosts
      (auth.*) that may bypass the per-service cross-origin ACL in
      `is_permitted`. #191 narrowed this to auth-only, closing a latent
      privilege path. If a non-service-manager origin ever gained that bypass,
      any app could skip a user's cross-origin ACL.

These tests pin the intended post-#191 behavior for both halves.
"""

import datetime
from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.models.auth import Token
from app.services.auth import is_permitted


def _future_iso(minutes: int = 60) -> str:
    return (datetime.datetime.utcnow() + datetime.timedelta(minutes=minutes)).isoformat()


def _token(payload: dict) -> str:
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


def _cross_origin_token(site: str) -> str:
    """A certified, cross-origin-targeted token issued from `site`."""
    return _token(
        {
            "username": "visitor",
            "site": site,
            "target": settings.PROVIDER,
            "provider": settings.PROVIDER,
            "expires": _future_iso(),
        }
    )


# A term record whose cross_origins deliberately does NOT list the
# service-manager host. That way a grant to the SM host can only come from the
# CORS_SERVICE_MANAGERS bypass — never the per-service ACL — which isolates
# exactly the privilege #191 narrowed. The `.*` whitelist means get_approved
# would approve any user, so the ONLY gate left is the origin.
_TERM_RECORD = {
    "service": "myapi",
    "cross_origins": ["listed-app.example"],
    "whitelist": [{"username": ".*", "provider": ".*", "read": True}],
    "blacklist": [],
}


# ---------------------------------------------------------------------------
# (a) CORS is wide open — any web10 app origin works, credentials stay off
# ---------------------------------------------------------------------------


class TestPermissiveCors:
    def test_preflight_allows_any_origin(self):
        """A preflight from an arbitrary app origin gets allow-all back."""
        client = TestClient(fastapi_app)
        resp = client.options(
            "/anyuser/anyservice",
            headers={
                "Origin": "https://some-random-web10-app.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert resp.headers.get("access-control-allow-origin") == "*"

    def test_credentials_stay_off(self):
        """Credentialed CORS must NOT be enabled — no allow-credentials echo.

        The token travels in the request body, not on a cookie, so turning on
        credentials (which also forces a specific origin instead of `*`) would
        be both unnecessary and a regression from the #191 design.
        """
        client = TestClient(fastapi_app)
        resp = client.options(
            "/anyuser/anyservice",
            headers={
                "Origin": "https://some-random-web10-app.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert "access-control-allow-credentials" not in resp.headers


# ---------------------------------------------------------------------------
# (a') Error responses carry CORS headers too.
#
# A handler registered for the base `Exception` is installed in Starlette's
# outermost ServerErrorMiddleware, which wraps CORSMiddleware — so its responses
# bypass CORS and ship with NO Access-Control-Allow-Origin. Every service-layer
# `raise Exception("TOKEN")` (e.g. an expired token in `certify`) hit this path,
# so a browser saw an opaque "No 'Access-Control-Allow-Origin' header" CORS
# failure instead of the real 401 — masking expired-token/500/422 errors across
# the whole app. The exception handlers now stamp the wildcard header.
# ---------------------------------------------------------------------------


class TestErrorResponsesHaveCors:
    def test_bare_exception_token_error_has_cors(self):
        """`/certify` with a bad token raises a bare Exception('TOKEN') → 401.

        This is the path that masked expired tokens as CORS errors: the response
        the browser receives must carry access-control-allow-origin so the 401 is
        delivered (not reported as a CORS failure). `raise_server_exceptions` is
        off because ServerErrorMiddleware — the very layer that wraps CORS and
        drops the header — re-raises for server logging after building the
        response; the browser only ever sees the response, so that is what we
        assert on.
        """
        client = TestClient(fastapi_app, raise_server_exceptions=False)
        resp = client.post(
            "/certify",
            json={"token": "garbage.not.a.jwt"},
            headers={"Origin": "https://social.web10.app"},
        )
        assert resp.status_code == 401
        assert resp.headers.get("access-control-allow-origin") == "*"

    def test_validation_error_has_cors(self):
        """A 422 validation error must also carry the CORS header."""
        client = TestClient(fastapi_app, raise_server_exceptions=False)
        # A non-object body fails Token model validation → RequestValidationError.
        resp = client.post(
            "/certify",
            json=[1, 2, 3],
            headers={"Origin": "https://social.web10.app"},
        )
        assert resp.status_code == 422
        assert resp.headers.get("access-control-allow-origin") == "*"

    def test_unhandled_exception_self_reports(self):
        """An unmapped exception's 500 body carries type + detail + error_id.

        The profile-upload outage (CHANGELOG 1.0.128) was two unhandled
        exceptions that both collapsed to an identical opaque
        `{"message": "internal server error"}`, forcing an SSH into the box to
        read the traceback. The handler now surfaces the exception class and
        message (safe — the code is open source) plus a correlation id, so a
        future 500 is diagnosable from the browser console. The full traceback
        stays server-side only.
        """
        client = TestClient(fastapi_app, raise_server_exceptions=False)
        with patch("app.endpoints.crud.is_permitted", side_effect=RuntimeError("boom")):
            resp = client.post(
                "/owner/myservice/update",
                json={"token": None, "query": {}, "update": {"$set": {"x": 1}}},
                headers={"Origin": "https://social.web10.app"},
            )
        assert resp.status_code == 500
        assert resp.headers.get("access-control-allow-origin") == "*"
        body = resp.json()
        assert body["error"] == "RuntimeError"
        assert body["detail"] == "boom"
        assert body["error_id"] and len(body["error_id"]) == 12


# ---------------------------------------------------------------------------
# (b) CORS_SERVICE_MANAGERS gates the is_permitted cross-origin bypass
# ---------------------------------------------------------------------------


class TestServiceManagerBypassGating:
    def test_service_manager_bypasses_cross_origin_acl(self):
        """An authenticator host on the SM list skips the per-service ACL."""
        token = _cross_origin_token("auth.localhost")
        with (
            patch.object(settings, "CORS_SERVICE_MANAGERS", ["auth.localhost"]),
            patch("app.services.documentdb.get_term_record", return_value=_TERM_RECORD),
        ):
            # auth.localhost is NOT in cross_origins, yet the SM bypass grants it.
            assert is_permitted(Token(token=token), "owner", "myapi", "read") is True

    def test_non_service_manager_denied_the_privilege(self):
        """A normal app origin gets NO service-manager privilege.

        Same term record, same `.*` whitelist that get_approved would honor —
        but a non-SM origin that isn't listed in cross_origins gets no bypass,
        so it is denied. This is the boundary #191 narrowed to auth-only.
        """
        token = _cross_origin_token("some-random-web10-app.example")
        with (
            patch.object(settings, "CORS_SERVICE_MANAGERS", ["auth.localhost"]),
            patch("app.services.documentdb.get_term_record", return_value=_TERM_RECORD),
        ):
            assert is_permitted(Token(token=token), "owner", "myapi", "read") is False

    def test_non_service_manager_still_allowed_via_cross_origins(self):
        """Sanity: the denial above is the SM gate, not a broken ACL.

        A non-SM origin explicitly listed in the service's cross_origins is
        still allowed — the per-service ACL path is intact.
        """
        token = _cross_origin_token("listed-app.example")
        with (
            patch.object(settings, "CORS_SERVICE_MANAGERS", ["auth.localhost"]),
            patch("app.services.documentdb.get_term_record", return_value=_TERM_RECORD),
        ):
            assert is_permitted(Token(token=token), "owner", "myapi", "read") is True
