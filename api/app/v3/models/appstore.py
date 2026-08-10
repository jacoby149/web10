from pydantic import BaseModel


class RegisterApp(BaseModel):
    body: dict


class CreateAppRating(BaseModel):
    token: str
    body: dict


class GetAppRatings(BaseModel):
    body: dict
