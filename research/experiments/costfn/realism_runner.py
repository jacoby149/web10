"""Derived-rerun admission/envelope selection, with no provisioning or uploads.

This is deliberately not an execution switch. A passing file validator alone
does not prove node import, live view deltas, budget or operator review.
"""
import argparse
import json
from pathlib import Path
import re

from realism_contract import FORMAT, identity

HERE = Path(__file__).resolve().parent


def compose(project, port=6095, sensitivity=False):
    if not re.fullmatch(r"web10-costfn-frozen-[a-z0-9-]{1,32}", project):
        raise ValueError("dedicated disposable project required")
    if type(port) is not int or not 1024 <= port <= 65535:
        raise ValueError("unprivileged loopback API port required")
    files = ["compose.yml", "research.compose.yml"]
    if not sensitivity:
        files.append("realism.compose.yml")
    command = ["docker", "compose"]
    for filename in files:
        command.extend(["-f", str(HERE / filename)])
    return {"command":command+["-p",project],"environment":{"API_PORT":str(port)},
            "envelope":{"container_bytes":(5 if sensitivity else 28)*1024**3,
                        "clickhouse_server_bytes":(4 if sensitivity else 22)*1024**3,
                        "sensitivity":sensitivity}}


def admission(directory, receipt):
    from realism_validate import current_receipt
    manifest = json.loads((Path(directory)/"manifest.json").read_bytes())
    checked = json.loads(Path(receipt).read_bytes())
    checks = checked.get("checks", {})
    if (manifest.get("format") != FORMAT or manifest.get("dataset_id") != identity(manifest)
            or checked.get("dataset_id") != manifest["dataset_id"] or checked.get("complete") is not True
            or not current_receipt(checked)
            or not checks or not all(v is True for v in checks.values())):
        raise ValueError("matching current independent passing derived validation receipt required; V2 is not this study")
    return {"dataset_id":manifest["dataset_id"],"file_validation_complete":True,
            "pilot_ready":False,"execution_authorized":False,"uploads_authorized":False,
            "remaining_gates":["10k AND 100k current-source floors before 1M build",
                               "source-matched node import and independent live-delivery delta oracle",
                               "operator generated-statistics review",
                               "exact uniform SKU eligibility, pilot budget and independent cleanup watchdog"],
            "envelope":compose("web10-costfn-frozen-rd-preflight")["envelope"]}


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory",type=Path)
    parser.add_argument("--receipt",type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(admission(args.directory,args.receipt),indent=2))
