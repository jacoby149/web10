"""Task admission and the host-only backstop; historical receipts stay exact."""
import re
from datetime import UTC, datetime

DIRECTIVE = 'Jacob Hoffman 2026-11-20 analytics layout and 24-hour backstop'
TASK_RULES = 'Jacob Hoffman 2026-11-24 costfn task continuation'
SECONDS = 86400
PROGRAMME_USD = 1000


def enabled(value):
    return (value.get('layout_clock_directive') == DIRECTIVE
        and value.get('composition_admitted') is True and value.get('row_model_admitted') is True)


def task(value):
    if not value.get('costfn_task_id') and not value.get('costfn_run_rules'):
        return False
    if (value.get('costfn_run_rules') != TASK_RULES
            or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', str(value.get('costfn_task_id', '')))):
        raise ValueError('named costfn task and exact governing directive required')
    return True


def working(value, start, deadline, now):
    return start <= now and (task(value) or now < deadline)


def work_seconds(value, deadline):
    return float('inf') if task(value) else (deadline - datetime.now(UTC)).total_seconds()


def valid(value, seconds, *, cloud=False, subordinate=False):
    if task(value):
        # The timestamp remains in wire receipts for compatibility. It is the
        # inherited host failsafe, not a work deadline or a query budget.
        return seconds == SECONDS
    budget = value.get('max_usd' if cloud else 'budget_usd', 0)
    if enabled(value):
        return seconds == SECONDS and budget == PROGRAMME_USD
    return (0 < seconds <= 14400 and 0 < budget <= 2) if subordinate else (seconds == 14400 and budget == 2)
