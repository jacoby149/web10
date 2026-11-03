"""Loopback-only real HLS router + isolated ClickHouse; not a production server."""

import contextlib
import hmac
import io
import json
import logging
import re
import secrets
import socket
import sys
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
phase = "input"
try:
    q = json.load(sys.stdin)
    if not re.fullmatch(r"web10-cdn-smoke-\d{8}-[a-f0-9]{16}", q["bucket"]):
        raise ValueError("invalid isolated bucket")
    if q["database"] != "cdn_acceptance" or q["dbhost"] != "127.0.0.1":
        raise ValueError("isolated loopback database required")
    with (
        contextlib.redirect_stdout(io.StringIO()),
        contextlib.redirect_stderr(io.StringIO()),
    ):
        phase = "imports"
        import uvicorn
        from fastapi import FastAPI, Header, HTTPException
        from fastapi.responses import HTMLResponse, FileResponse
        from app.services import hls
        from app.v3.endpoints import media
        from app.v3.services import clickhouse as ch
        import app.settings as settings

        phase = "configure"
        for key, value in {
            "CLICKHOUSE_HOST": q["dbhost"],
            "CLICKHOUSE_PORT": q["dbport"],
            "CLICKHOUSE_DATABASE": q["database"],
            "CLICKHOUSE_USER": "cdn_acceptance",
            "CLICKHOUSE_PASSWORD": q["dbpassword"],
            "CLICKHOUSE_SECURE": False,
            "MEDIA_DELIVERY_ENABLED": True,
            "MEDIA_DELIVERY_BASE": q["delivery"],
            "MEDIA_DELIVERY_ISSUER": q["bucket"],
            "MEDIA_DELIVERY_AUDIENCE": q["worker"],
            "MEDIA_DELIVERY_KID": "smoke",
            "MEDIA_DELIVERY_PRIVATE_KEY": q["pem"],
            "MEDIA_DELIVERY_TTL": 60,
            "S3_BUCKET": q["bucket"],
            "S3_ENDPOINT": q["origin"],
            "S3_ACCESS_KEY": q["accessKey"],
            "S3_SECRET_KEY": q["secretKey"],
            "S3_REGION": "us-east-1",
            "S3_USE_SSL": True,
            "ALGORITHM": "HS256",
            "PRIVATE_KEY": secrets.token_urlsafe(48),
            "HLS_SIG_TTL": 15,
        }.items():
            setattr(settings, key, value)

        phase = "schema"
        db = ch._get_client()
        if db.query("SHOW TABLES").result_rows:
            raise ValueError("database is not empty")
        source = (ROOT / "clickhouse-init/001-init-v3-schema.sql.template").read_text()
        for table in ["documents", "doc_groups", "group_contracts", "group_members"]:
            statement = re.search(
                r"CREATE TABLE IF NOT EXISTS " + table + r" \([\s\S]*?ORDER BY [^;]+;",
                source,
            )
            if statement is None:
                raise ValueError("schema statement missing")
            db.command(statement.group(0))
        db.command(
            "ALTER TABLE group_contracts ADD COLUMN tags Array(String) DEFAULT []"
        )
        db.command(
            "ALTER TABLE group_contracts ADD COLUMN membership_visibility String DEFAULT 'hidden'"
        )

        phase = "seed"
        doc_id = "isolated-playback"
        prefix = "cdn-smoke/video/hls"
        private_group, carrier_group = "acceptance-private", "acceptance-carrier"
        roles = [{"name": "reader", "permissions": {"posts": ["readAll"]}}]
        for group in [private_group, carrier_group]:
            ch.create_group(group, roles, "closed")
        body = {
            "video": {"type": "minio", "value": "cdn-smoke/video/source.mp4"},
            "transcoding_settings": {
                "enabled": True,
                "variants": [
                    {
                        "height": 180,
                        "width": 320,
                        "bitrate_kbps": 384,
                        "url": {"type": "minio", "value": prefix + "/180p/index.m3u8"},
                    }
                ],
            },
        }
        ch.insert_document(
            "cdn-smoke", "media_metadata", body, doc_id=doc_id, posted_by="cdn-smoke"
        )
        ch.attach_doc_to_groups(doc_id, [private_group])
        ch.insert_document(
            "cdn-smoke",
            "posts",
            {"media_refs": [doc_id]},
            doc_id="carrier",
            posted_by="cdn-smoke",
        )
        ch.attach_doc_to_groups("carrier", [carrier_group])
        ch.add_group_member(private_group, "reader", "reader")
        version = db.query("SELECT version()").result_rows[0][0]
        if media.can_view_doc is not hls.can_view_doc:
            raise ValueError("unexpected permission implementation")

    # There is no patch to can_view_doc, a database client, permissions or storage.
    phase = "app"
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.add_api_route("/v3/media/hls/manifest", media.hls_manifest, methods=["GET"])
    app.add_api_route("/v3/media/hls/variant", media.hls_variant, methods=["GET"])
    for logger_name in [
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "httpx",
        "clickhouse_connect",
    ]:
        logging.getLogger(logger_name).disabled = True

    @app.get("/fixture/health")
    def health():
        return {"ready": True, "engine": version, "authorityStubbed": False}

    @app.get("/")
    def index():
        return HTMLResponse(
            "<!doctype html><html><head><title>Isolated real-database media check</title></head>"
            '<body><h1>Isolated real-database media check</h1><p id="result">Running.</p></body></html>',
            headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
        )

    @app.get("/hls.min.js")
    def script():
        return FileResponse(
            ROOT / "marketing/web10-social/public/hls.min.js",
            media_type="text/javascript",
        )

    @app.post("/fixture/control")
    def control(data: dict, x_fixture_key: str = Header(default="")):
        if not hmac.compare_digest(x_fixture_key, q["controller"]):
            raise HTTPException(403)
        action = data.get("action")
        if action == "mint":
            reader = data.get("reader")
            if reader not in ["cdn-smoke", "reader", "outsider", "anon"]:
                raise HTTPException(400)
            ttl = data.get("ttl", 15)
            if type(ttl) is not int or ttl not in [8, 15, 60]:
                raise HTTPException(400)
            settings.HLS_SIG_TTL = ttl
            sig = hls.mint_sig(
                reader, doc_id, prefix, authenticated=data.get("authenticated") is True
            )
            payload = hls.verify_sig(sig, doc_id)
            return {
                "manifest": "/v3/media/hls/manifest?"
                + urlencode({"doc_id": doc_id, "sig": sig}),
                "variant": "/v3/media/hls/variant?"
                + urlencode({"doc_id": doc_id, "variant": "180p", "sig": sig}),
                "expires": payload["exp"],
            }
        groups = {"private": private_group, "carrier": carrier_group}
        group = groups.get(data.get("group"))
        member = data.get("member")
        if group is None or member not in ["reader", "anyone", "authenticated"]:
            raise HTTPException(400)
        if action == "grant":
            ch.add_group_member(group, member, "reader")
        elif action == "revoke":
            ch.remove_group_member(group, member)
        else:
            raise HTTPException(400)
        return {"changed": True}

    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    print(
        json.dumps(
            {
                "port": listener.getsockname()[1],
                "engine": version,
                "authorityStubbed": False,
            }
        ),
        flush=True,
    )
    phase = "serve"
    server = uvicorn.Server(
        uvicorn.Config(
            app, log_config=None, access_log=False, lifespan="off", limit_concurrency=8
        )
    )
    server.run(sockets=[listener])
except BaseException as error:
    sys.stderr.write("node-stage-failed:" + phase + ":" + type(error).__name__ + "\n")
    sys.exit(1)
