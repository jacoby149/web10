"""Operational date-run guards: rejected targets stay untouched; cleanup beats logs."""

import json
import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def runner(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).parents[2] / "research/experiments/costfn"))
    import run_date_case

    monkeypatch.setenv("QUERY_EVAL_DATE_PRUNING", "0")
    monkeypatch.setattr(run_date_case.date_case, "validate", lambda path: {"dataset_id": "synthetic"})
    monkeypatch.setattr(run_date_case.date_case, "sources", lambda: {"synthetic": True})
    return run_date_case


def test_rejected_existing_target_gets_no_diagnostics_or_cleanup(runner, monkeypatch, tmp_path):
    def reject(*args, **kwargs):
        raise ValueError("existing target")

    calls = []
    monkeypatch.setattr(runner.restore_dataset, "restore", reject)
    monkeypatch.setattr(runner.subprocess, "run", lambda *args, **kwargs: calls.append(args))
    with pytest.raises(ValueError, match="existing target"):
        runner.run(tmp_path / "input", tmp_path / "out", "candidate", "web10-costfn-frozen-date-guard")
    assert calls == []
    assert json.loads((tmp_path / "out/stage.json").read_bytes())["cleanup"] == "not-owned-no-access"


def test_diagnostic_timeout_preserves_primary_failure_and_still_cleans_owned_target(runner, monkeypatch, tmp_path):
    def partial(*args, **kwargs):
        kwargs["on_created"]()
        raise ValueError("primary preparation failure")

    calls = []

    def execute(command, **kwargs):
        calls.append(command)
        if "logs" in command or "exec" in command:
            raise subprocess.TimeoutExpired(command, 1)
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    monkeypatch.setattr(runner.restore_dataset, "restore", partial)
    monkeypatch.setattr(runner.subprocess, "run", execute)
    with pytest.raises(ValueError, match="primary preparation failure"):
        runner.run(tmp_path / "input", tmp_path / "out", "candidate", "web10-costfn-frozen-date-guard")
    assert any("down" in command for command in calls)
    report = json.loads((tmp_path / "out/stage.json").read_bytes())
    assert report["cleanup"] == "verified-empty"
    assert report["diagnostic_errors"]
