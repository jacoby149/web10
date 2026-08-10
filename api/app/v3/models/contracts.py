from pydantic import BaseModel


class AddAppContract(BaseModel):
    token: str
    allowed_origin: str
    permissions: dict


class RevokeAppContract(BaseModel):
    token: str
    allowed_origin: str | None = None
