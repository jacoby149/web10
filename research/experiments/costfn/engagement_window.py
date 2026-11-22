"""Nov20 explicit composition-only 24h backstop; historical admissions stay exact."""
DIRECTIVE = 'Jacob Hoffman 2026-11-20 analytics layout and 24-hour backstop'
SECONDS = 86400
PROGRAMME_USD = 1000


def enabled(value):
    return (value.get('layout_clock_directive') == DIRECTIVE
        and value.get('composition_admitted') is True and value.get('row_model_admitted') is True)


def valid(value, seconds, *, cloud=False, subordinate=False):
    budget = value.get('max_usd' if cloud else 'budget_usd', 0)
    if enabled(value):
        return seconds == SECONDS and budget == PROGRAMME_USD
    return (0 < seconds <= 14400 and 0 < budget <= 2) if subordinate else (seconds == 14400 and budget == 2)
