from pydantic import BaseModel


class PayData(BaseModel):
    token: str
    seller: str
    title: str
    price: int | None = None
    success_url: str | None = None
    cancel_url: str | None = None
