"""DNS aliases are public pointers, never authentication principals."""

import ipaddress
import logging
import re

import dns.exception
import dns.resolver

logger = logging.getLogger("web10-domains")


def normalize_domain(value: str) -> str:
    if not value or value != value.strip() or any(c in value for c in "/:@?#\\"):
        raise ValueError("invalid_domain")
    try:
        domain = value.encode("idna").decode("ascii").lower().removesuffix(".")
        # Validate existing punycode as well as Unicode input.
        domain.encode("ascii").decode("idna")
    except UnicodeError:
        raise ValueError("invalid_domain") from None
    labels = domain.split(".")
    # Leave room for the web10. lookup prefix in the DNS wire name.
    if (
        len(domain) > 247
        or len(labels) < 2
        or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels)
        or labels[-1].isdigit()
    ):
        raise ValueError("invalid_domain")
    try:
        ipaddress.ip_address(domain)
    except ValueError:
        return domain
    raise ValueError("invalid_domain")


def verify_txt(domain: str, provider: str, username: str) -> str | None:
    logger.info("[domains] DNS lookup started")
    try:
        resolver = dns.resolver.Resolver()
        resolver.timeout = 2.0
        answer = resolver.resolve(f"web10.{domain}.", "TXT", lifetime=5.0, search=False)
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return "txt_record_not_found"
    except dns.exception.Timeout:
        return "dns_timeout"
    except dns.exception.DNSException:
        return "dns_error"
    claims = []
    total = 0
    for record in answer:
        total += 1
        raw = b"".join(record.strings)
        if total > 64 or len(raw) > 4096:
            return "bad_format"
        if raw.startswith(b"web10.v"):
            claims.append(raw)
    logger.info("[domains] DNS lookup completed records=%d claims=%d", total, len(claims))
    if not claims:
        return "txt_record_not_found"
    if len(claims) != 1:
        return "multiple_claims"
    try:
        claim = claims[0].decode("ascii")
    except UnicodeDecodeError:
        return "bad_format"
    match = re.fullmatch(r"web10\.v=1;provider=([^;\s]+);user=([^;\s]+)", claim)
    if not match:
        return "bad_format"
    if match[1] != provider:
        return "wrong_provider"
    if match[2] != username:
        return "wrong_user"
    return None
