from pydantic import BaseModel


class TokenOnly(BaseModel):
    """Endpoints that only need a JWT, no other input."""

    token: str
