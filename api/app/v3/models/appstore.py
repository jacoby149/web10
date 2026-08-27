from pydantic import BaseModel


class RegisterApp(BaseModel):
    body: dict


class ListStoreApps(BaseModel):
    """Public store list (D49) — paginated, no token needed. The store is a
    public surface; the token is optional (reserved)."""

    limit: int = 20
    offset: int = 0
    token: str | None = None


class CreateAppRating(BaseModel):
    token: str
    body: dict


class GetAppRatings(BaseModel):
    body: dict


class AppsAdmin(BaseModel):
    token: str


class ApproveApp(BaseModel):
    token: str
    url: str
    approved: bool = True
    reviewer_note: str = ""
