"""Feature-film budgets use probed duration without removing the worker cap."""

from unittest.mock import patch

import pytest

from app import settings
from app.services import transcode


@pytest.mark.parametrize(
    "duration,budget", [(None, 600), (2, 600), (5514, 11028), (10800, 21600), (86400, 21600), (1e308, 21600)]
)
def test_duration_budget(duration, budget, monkeypatch):
    monkeypatch.setattr(settings, "HLS_FFMPEG_TIMEOUT", 21600)
    assert transcode._ffmpeg_budget(duration) == budget


def test_explicit_operator_ceiling_wins(monkeypatch):
    monkeypatch.setattr(settings, "HLS_FFMPEG_TIMEOUT", 300)
    assert transcode._ffmpeg_budget(5514) == 300
    assert transcode._ffmpeg_budget() == 300


@pytest.mark.parametrize("duration", [float("nan"), float("inf"), -1])
def test_invalid_probe_budget_rejected(duration):
    with pytest.raises(ValueError, match="invalid source duration"):
        transcode._ffmpeg_budget(duration)


def test_subprocess_receives_film_budget(monkeypatch):
    monkeypatch.setattr(settings, "HLS_FFMPEG_TIMEOUT", 21600)
    with patch.object(transcode.subprocess, "run") as run:
        run.return_value.returncode = 0
        transcode._run_ffmpeg(["-i", "synthetic.mp4"], "rendition 360p", duration_seconds=5514)
    assert run.call_args.kwargs["timeout"] == 11028
