"""Real CLI/file seams, with synthetic Mongo records and disposable storage only."""

import builtins
import errno
import hashlib
import json
import os
import stat
from unittest.mock import MagicMock

import pytest

from tools import extract_accounts as ea

URI = "mongodb://synthetic:synthetic-secret@db.invalid/?appName=synthetic"


@pytest.fixture
def cli(monkeypatch):
    col = MagicMock()
    col.find_one.return_value = {
        "body": {
            "username": "synthetic-user",
            "hashed_password": "synthetic-hash",
            "email": "synthetic@example.invalid",
        }
    }
    db = MagicMock()
    db.list_collection_names.return_value = ["synthetic-user"]
    db.__getitem__.return_value = col
    client = MagicMock()
    client.__getitem__.return_value = db
    monkeypatch.setattr(ea.pymongo, "MongoClient", lambda *a, **kw: client)

    def run(path=None, *extra):
        args = ["--uri", URI, "--db", "synthetic"]
        if path is not None:
            args += ["--out", str(path)]
        return ea.main(args + list(extra))

    return run


def assert_failure(cli, path, capsys):
    assert cli(path) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "Wrote " not in captured.err
    assert "Extracted " not in captured.err
    assert "synthetic-secret" not in captured.err
    assert "synthetic-hash" not in captured.err
    assert "synthetic@example.invalid" not in captured.err


def test_private_complete_manifest_under_umask_022(cli, tmp_path):
    path = tmp_path / "fresh.json"
    old = os.umask(0o022)
    try:
        assert cli(path) == 0
    finally:
        os.umask(old)
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    payload = path.read_text(encoding="utf-8")
    data = json.loads(payload)
    assert payload == json.dumps(data, indent=2)
    assert data["source"] == {"db": "synthetic"}
    assert data["count"] == 1
    assert data["users"][0]["password_hash"] == "synthetic-hash"
    canonical = json.dumps(data["users"], sort_keys=True, separators=(",", ":"))
    assert data["sha256"] == hashlib.sha256(canonical.encode()).hexdigest()
    assert "synthetic-secret" not in payload
    assert list(tmp_path.iterdir()) == [path]


@pytest.mark.parametrize("symlink", [False, True])
def test_existing_backup_or_symlink_sentinel_preserved(cli, tmp_path, capsys, symlink):
    sentinel = tmp_path / "only-backup.json"
    sentinel.write_bytes(b"synthetic-only-backup")
    before = sentinel.stat()
    path = tmp_path / "requested.json" if symlink else sentinel
    if symlink:
        path.symlink_to(sentinel)
    assert_failure(cli, path, capsys)
    assert sentinel.read_bytes() == b"synthetic-only-backup"
    assert sentinel.stat().st_ino == before.st_ino
    assert sentinel.stat().st_mode == before.st_mode
    assert path.is_symlink() == symlink
    assert set(tmp_path.iterdir()) == {sentinel, path}


@pytest.mark.parametrize("stage", ["write", "flush", "fsync", "link"])
def test_interrupted_output_never_publishes(cli, tmp_path, monkeypatch, capsys, stage):
    path = tmp_path / "fresh.json"
    backup = tmp_path / "only-backup.json"
    backup.write_bytes(b"synthetic-only-backup")
    real_open, real_fdopen = builtins.open, os.fdopen

    class InterruptedFile:
        def __init__(self, stream):
            self.stream = stream

        def __enter__(self):
            return self

        def __exit__(self, *args):
            self.stream.close()

        def write(self, payload):
            if stage == "write":
                self.stream.write(payload[:10])
                raise OSError(URI)
            return self.stream.write(payload)

        def flush(self):
            if stage == "flush":
                raise OSError(URI)
            return self.stream.flush()

        def fileno(self):
            return self.stream.fileno()

    if stage in {"write", "flush"}:
        monkeypatch.setattr(ea, "open", lambda *a, **kw: InterruptedFile(real_open(*a, **kw)), raising=False)
        monkeypatch.setattr(ea.os, "fdopen", lambda *a, **kw: InterruptedFile(real_fdopen(*a, **kw)))
    else:

        def fail(*args):
            raise OSError(errno.EOPNOTSUPP, URI)

        monkeypatch.setattr(ea.os, stage, fail)
    assert_failure(cli, path, capsys)
    assert not path.exists()
    assert backup.read_bytes() == b"synthetic-only-backup"
    assert list(tmp_path.iterdir()) == [backup]


def test_dangling_symlink_preserved(cli, tmp_path, capsys):
    target = tmp_path / "absent.json"
    path = tmp_path / "requested.json"
    path.symlink_to(target)
    assert_failure(cli, path, capsys)
    assert path.is_symlink()
    assert not target.exists()


def test_stdout_remains_manifest(cli, capsys):
    assert cli() == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert data["count"] == 1
    assert data["users"][0]["password_hash"] == "synthetic-hash"
    assert "synthetic-secret" not in captured.out + captured.err


def test_staging_private_and_complete_before_atomic_publish(cli, tmp_path, monkeypatch):
    path = tmp_path / "fresh.json"
    real_fdopen, real_link = os.fdopen, os.link
    seen = []

    def fdopen(fd, *args, **kwargs):
        assert stat.S_IMODE(os.fstat(fd).st_mode) == 0o600
        assert os.fstat(fd).st_size == 0
        seen.append("private")
        return real_fdopen(fd, *args, **kwargs)

    def link(source, destination):
        assert not path.exists()
        assert os.path.dirname(source) == str(tmp_path)
        with builtins.open(source, encoding="utf-8") as stream:
            assert json.load(stream)["count"] == 1
        seen.append("complete")
        real_link(source, destination)

    monkeypatch.setattr(ea.os, "fdopen", fdopen)
    monkeypatch.setattr(ea.os, "link", link)
    assert cli(path) == 0
    assert seen == ["private", "complete"]


def test_destination_created_at_publish_is_not_clobbered(cli, tmp_path, monkeypatch, capsys):
    path = tmp_path / "fresh.json"
    real_link = os.link

    def link(source, destination):
        path.write_bytes(b"synthetic-competing-backup")
        real_link(source, destination)

    monkeypatch.setattr(ea.os, "link", link)
    assert_failure(cli, path, capsys)
    assert path.read_bytes() == b"synthetic-competing-backup"
    assert list(tmp_path.iterdir()) == [path]


def test_cleanup_failure_after_link_preserves_published_backup(cli, tmp_path, monkeypatch, capsys):
    path = tmp_path / "fresh.json"

    def fail(*args):
        raise OSError(URI)

    monkeypatch.setattr(ea.os, "unlink", fail)
    assert_failure(cli, path, capsys)
    assert json.loads(path.read_text())["count"] == 1
    temporary = next(p for p in tmp_path.iterdir() if p != path)
    assert temporary.stat().st_ino == path.stat().st_ino
    assert stat.S_IMODE(temporary.stat().st_mode) == 0o600


def test_repo_guard_and_explicit_override(cli, tmp_path, monkeypatch):
    monkeypatch.setattr(ea, "_git_repo_root", lambda: str(tmp_path))
    path = tmp_path / "fresh.json"
    with pytest.raises(SystemExit) as exc:
        cli(path)
    assert exc.value.code == 2
    assert not path.exists()
    assert cli(path, "--allow-repo") == 0
