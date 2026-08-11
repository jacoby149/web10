from pydantic import BaseModel


class RegisterApp(BaseModel):
    body: dict


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
