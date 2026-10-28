"""L1-DEPLOY-01: execute actual Docker install instructions with an inert Bun."""

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    "path,index,count",
    [
        ("marketing/marketing-ui/Dockerfile", 0, 2),
        ("marketing/marketing-ui/Dockerfile", 1, 2),
        ("marketing/web10-social/Dockerfile", 0, 1),
    ],
    ids=["marketing-deps", "marketing-sdk-deps", "social-deps"],
)
@pytest.mark.parametrize("frozen_exit", [0, 41], ids=["locked-success", "locked-failure"])
def test_docker_install_never_falls_back_to_unlocked_resolution(path, index, count, frozen_exit):
    instructions = [
        line.removeprefix("RUN ")
        for line in (ROOT / path).read_text().splitlines()
        if line.startswith("RUN bun install")
    ]
    assert len(instructions) == count
    probe = """
bun() {
    printf '%s\\n' "$*"
    if [ "$*" = 'install --frozen-lockfile' ]; then
        return "$FROZEN_EXIT"
    fi
    return 0
}
"""
    result = subprocess.run(
        ["/bin/sh", "-c", probe + instructions[index]],
        env={"FROZEN_EXIT": str(frozen_exit)},
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == frozen_exit
    assert result.stdout.splitlines() == ["install --frozen-lockfile"]
    assert result.stderr == ""


def test_api_ci_runs_regression_for_dockerfile_only_changes():
    filters = (ROOT / ".github/workflows/api.yml").read_text().split("concurrency:", 1)[0].splitlines()
    for path in ("marketing/marketing-ui/Dockerfile", "marketing/web10-social/Dockerfile"):
        assert f"      - {path}" in filters
