"""Validated Docker contexts for existing test hosts. No context/host creation."""
import ipaddress
import re
from pathlib import Path

from restore_dataset import compose_command


def private_ip(value):
    address = ipaddress.ip_address(value)
    if address.version != 4 or not address.is_private or any((address.is_loopback, address.is_link_local, address.is_reserved, address.is_unspecified, address.is_multicast)):
        raise ValueError("distributed binds require explicit non-loopback private IPv4")
    return str(address)


def commands(receipt, role="api"):
    base = compose_command(receipt["project"], receipt["api_port"], research=True)
    contexts = receipt.get("docker_contexts")
    if not contexts:
        return base
    context = contexts.get(role, "")
    if not re.fullmatch(r"costfn-[a-z0-9-]{1,40}", context):
        raise ValueError("use explicit existing costfn-* Docker contexts")
    # First compose file remains the base for all relative paths.
    return ["docker", "--context", context, *base[1:-2], "-f", str(Path(__file__).with_name("distributed.compose.yml")), *base[-2:]]


def docker_prefix(compose):
    return compose[:compose.index("compose")]


def environment(topology, environ):
    db_ip = private_ip(topology["db_private_ip"])
    api_ip = private_ip(topology["api_private_ip"])
    if db_ip == api_ip or topology["docker_contexts"]["api"] == topology["docker_contexts"]["db"]:
        raise ValueError("distributed API/DB must be separate hosts/contexts")
    root = topology["api_repo_directory"]
    if not isinstance(root, str) or not root.startswith("/") or any(c in root for c in ("\n", "\r", "$")) or ".." in Path(root).parts:
        raise ValueError("explicit absolute API-host source directory required")
    return {**environ, "API_PORT": str(topology["api_port"]), "COSTFN_DB_IP": db_ip, "COSTFN_API_IP": api_ip,
            "COSTFN_REPO_DIR": root, "COSTFN_RESEARCH_DIR": root + "/research/experiments/costfn",
            "QUERY_EVAL_NO_POLICY": "0", "QUERY_EVAL_STUB_EXECUTE": "0", "COSTFN_RESOLVER": "batched"}
