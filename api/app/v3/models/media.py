from pydantic import BaseModel


class ConfirmMedia(BaseModel):
    token: str
    body: dict


class ListMedia(BaseModel):
    token: str
    limit: int = 50
    offset: int = 0
    doc_ids: list[str] | None = None


class DeleteMedia(BaseModel):
    token: str
    doc_id: str


class UploadUrlRequest(BaseModel):
    token: str
    body: dict


class ReadUrlRequest(BaseModel):
    token: str
    body: dict


class TranscodeRequest(BaseModel):
    token: str
    doc_id: str


class ThumbnailRequest(BaseModel):
    # Optional — a missing token reads as `anon` (public docs thumbnail for a
    # crawler; a doc the reader can't read 404s, I3).
    token: str | None = None
    doc_id: str
