from pydantic import BaseModel

from app.v3.service_names import ServicePermissions


class AddAppContract(BaseModel):
    token: str
    allowed_origin: str
    permissions: ServicePermissions


class RevokeAppContract(BaseModel):
    token: str
    allowed_origin: str | None = None
    # OAuth delegation (D92): revoke a delegated contract by client_id instead
    # of allowed_origin. Mutually exclusive with allowed_origin.
    client_id: str | None = None
