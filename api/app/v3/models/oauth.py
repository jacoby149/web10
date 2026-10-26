from pydantic import BaseModel, Field


class RegisterOauthClient(BaseModel):
    token: str
    client_id: str = Field(min_length=1, max_length=128)
    client_name: str = Field(min_length=1, max_length=256)
    redirect_uris: list[str] = Field(min_length=1)


class RevokeOauthClient(BaseModel):
    token: str
    client_id: str = Field(min_length=1, max_length=128)


class LookupOauthClient(BaseModel):
    token: str
    client_id: str = Field(min_length=1, max_length=128)


class OauthAuthorize(BaseModel):
    """GET /oauth/authorize (the consent entry point, D92 O5). The user's
    session token authenticates; the client + redirect_uri name the app."""

    token: str
    client_id: str = Field(min_length=1, max_length=128)
    redirect_uri: str
    response_type: str = "code"
    state: str | None = None


class OauthToken(BaseModel):
    """POST /oauth/token (D92 O6/O7). Form-style fields; grant_type selects the
    flow (authorization_code | refresh_token)."""

    grant_type: str
    client_id: str = Field(min_length=1, max_length=128)
    client_secret: str | None = None
    code: str | None = None
    redirect_uri: str | None = None
    refresh_token: str | None = None
