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
