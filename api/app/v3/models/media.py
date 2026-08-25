from pydantic import BaseModel


class ConfirmMedia(BaseModel):
    token: str
    body: dict


class ListMedia(BaseModel):
    token: str
    limit: int = 50
    offset: int = 0


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
