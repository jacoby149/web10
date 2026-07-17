from pydantic import BaseModel, ConfigDict


class MediaToken(BaseModel):
    """Request body carrying a web10 JWT for authorization."""
    model_config = ConfigDict(extra="allow")

    token: str | None = None


class UploadRequest(BaseModel):
    """Request to get a presigned upload URL."""
    token: str | None = None
    filename: str
    mime_type: str | None = None
    size_bytes: int | None = None


class UploadResponse(BaseModel):
    """Presigned upload URL and metadata."""
    upload_url: str
    object_key: str
    content_type: str


class ReadRequest(BaseModel):
    """Request to get a presigned read URL."""
    token: str | None = None
    object_key: str


class ReadResponse(BaseModel):
    """Presigned read URL."""
    read_url: str
    expires_in: int


class MetadataCreate(BaseModel):
    """Media metadata record written to user's collection on upload confirmation."""
    model_config = ConfigDict(extra="allow")

    url: str
    filename: str
    mime_type: str | None = None
    size_bytes: int | None = None
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    thumbnail_url: str | None = None
    caption: str | None = None
    alt_text: str | None = None
    origin: str | None = "web10"
    origin_id: str | None = None
    encrypted: bool = False


class MetadataRecord(BaseModel):
    """Media metadata record as stored in MongoDB (with _id and created_at)."""
    model_config = ConfigDict(extra="allow")

    _id: str | None = None
    url: str
    filename: str
    created_at: str
    mime_type: str | None = None
    size_bytes: int | None = None
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    thumbnail_url: str | None = None
    hls_manifest_url: str | None = None
    caption: str | None = None
    alt_text: str | None = None
    origin: str | None = "web10"
    origin_id: str | None = None
    encrypted: bool = False
