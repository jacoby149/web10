"""L1-PKG-01: connection secrets must not accompany audit/account output."""

import json
import sys
from unittest.mock import MagicMock, patch

import pytest

from tools import audit_mongo, extract_accounts


@pytest.mark.parametrize(
    "uri",
    [
        "mongodb://SYNTHETIC_USER:SYNTHETIC_PASSWORD@db.invalid:27017/",
        "mongodb://db.invalid/?authMechanismProperties=AWS_SESSION_TOKEN:SYNTHETIC_QUERY",
        "mongodb+srv://SYNTHETIC_USER:p%40SYNTHETIC_PASSWORD@db.invalid/?tls=true",
        "mongodb://db.invalid:27017/",
    ],
)
@pytest.mark.parametrize("destination", ["audit", "stdout", "file"])
def test_connection_material_is_not_copied(uri, destination, capsys, tmp_path):
    star = {"username": "alice", "hashed_password": "synthetic-account-hash", "service": "*"}
    collection = MagicMock()
    collection.find.return_value = [star]
    collection.find_one.side_effect = lambda query: star if query == {"service": "*"} else None
    db = MagicMock()
    db.list_collection_names.return_value = ["alice"]
    db.__getitem__.return_value = collection
    client = MagicMock()
    client.__getitem__.return_value = db
    module = audit_mongo if destination == "audit" else extract_accounts
    output = tmp_path / "accounts.json"
    with patch.object(module.pymongo, "MongoClient", return_value=client) as connect:
        if destination == "audit":
            with patch.object(sys, "argv", ["audit_mongo.py", "--uri", uri, "--db", "deploy"]):
                assert module.main() == 0
        else:
            args = ["--uri", uri, "--db", "deploy"]
            if destination == "file":
                args += ["--out", str(output)]
            assert module.main(args) == 0
    connect.assert_called_once_with(uri, serverSelectionTimeoutMS=5000)
    client.close.assert_called_once()
    captured = capsys.readouterr()
    payload = output.read_text() if destination == "file" else captured.out
    # Never include captured credential material in assertion failure output.
    assert not any(value in payload + captured.out + captured.err for value in (uri, "SYNTHETIC_"))
    if destination == "audit":
        assert "DB:  deploy" in captured.out
        assert "Users (collections):     1" in captured.out
    else:
        manifest = json.loads(payload)
        assert manifest["source"] == {"db": "deploy"}
        assert manifest["count"] == 1
        assert manifest["users"][0]["password_hash"] == star["hashed_password"]
        assert manifest["sha256"] == extract_accounts._sha256_of_rows(manifest["users"])
        assert "Extracted 1 accounts. SHA-256:" in captured.err
