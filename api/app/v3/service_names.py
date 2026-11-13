"""Canonical service identity; no authority is granted by a valid name."""

import re
from typing import Annotated

from pydantic import BeforeValidator

# Keep the query compiler's raw-table protections a subset of this set.
RESERVED = frozenset(
    (
        "documents doc_groups group_contracts group_members group_join_requests group_hidden_docs "
        "banned_users user_blacklist group_blacklist user_group_sharing app_contracts "
        "provider_service_contracts service_contracts users moderation_flags node_config "
        "group_meta memberships group"
    ).split()
)
_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,63}", re.ASCII)


def canonical_service(value, *, metadata=False):
    if not isinstance(value, str):
        raise ValueError("service name must be a string")
    if metadata and value == "*":
        return value
    if not _NAME.fullmatch(value):
        raise ValueError("service name must be 1-64 ASCII letters/digits/hyphens/underscores, starting with a letter")
    value = value.lower()
    if metadata and value == "group":
        return value
    if value in RESERVED:
        raise ValueError("reserved service name")
    return value


def canonical_map(value, *, metadata=False):
    if not isinstance(value, dict):
        raise ValueError("service permissions must be an object")
    result = {}
    for key, operations in value.items():
        name = canonical_service(key, metadata=metadata)
        if name in result:
            raise ValueError("case-colliding service names are not allowed")
        result[name] = operations
    return result


def canonical_roles(roles):
    if not isinstance(roles, list) or any(not isinstance(role, dict) for role in roles):
        raise ValueError("roles must be a list of objects")
    result = []
    for role in roles:
        role = dict(role)
        if isinstance(role.get("permissions"), dict):
            role["permissions"] = canonical_map(role["permissions"], metadata=True)
        if role.get("services") is not None:
            if not isinstance(role["services"], list) or any(not isinstance(name, str) for name in role["services"]):
                raise ValueError("role services must be a list of names")
            role["services"] = list(canonical_map(dict.fromkeys(role["services"]), metadata=True))
        result.append(role)
    return result


ServiceName = Annotated[str, BeforeValidator(canonical_service)]
GroupService = Annotated[str, BeforeValidator(lambda value: canonical_service(value, metadata=True))]
ServicePermissions = Annotated[dict, BeforeValidator(canonical_map)]
GroupRoles = Annotated[list[dict], BeforeValidator(canonical_roles)]
