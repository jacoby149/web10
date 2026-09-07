from pydantic import BaseModel


class ImportPart(BaseModel):
    filename: str
    size_bytes: int | None = None


class ImportCreate(BaseModel):
    token: str
    platform: str
    parts: list[ImportPart]


class ImportJobRef(BaseModel):
    token: str
    job_id: str
