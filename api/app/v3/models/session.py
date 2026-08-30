from pydantic import BaseModel, Field


class VerifySession(BaseModel):
    """POST /v3/session/verify — the confirmatory session-health check.

    The server runs the ACTUAL checks it would run on a real request (token
    decode, user lookup, app-contract check, followers-group membership) and
    reports each as a stable code. This is the oracle the app's SessionGuard
    executes — the client never guesses from status codes.

    Every store-backed field separates a DECISIVE answer (the check ran clean)
    from `unknown` (the check couldn't run — store unreadable). Only decisive
    negatives drive recovery actions; `unknown` never does (a failed health
    CHECK must not be handled like a failed health ANSWER).
    """

    # The JWT to verify. None/empty → token: "missing".
    token: str | None = None
    # The services the calling app needs (it declares its own — the signal is
    # platform-level, the policy is per-app). Empty → no contract check.
    services: list[str] = Field(default_factory=list)
    # The operations each service must grant for it to count as "granted".
    # All listed ops must be permitted. Defaults to the universal read op.
    operations: list[str] = Field(default_factory=lambda: ["readAll"])
