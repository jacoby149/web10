from pydantic import BaseModel, ConfigDict, field_validator

MEDIA_SERVICE_ALLOWLIST = {"media", "public_media"}


class MediaToken(BaseModel):
    model_config = ConfigDict(extra="allow")
    token: str | None = None


class ListRequest(BaseModel):
    token: str | None = None
    service: str = "media"

    @field_validator("service")
    @classmethod
    def validate_service(cls, v: str) -> str:
        if v not in MEDIA_SERVICE_ALLOWLIST:
            raise ValueError(f"service must be one of {sorted(MEDIA_SERVICE_ALLOWLIST)}, got '{v}'")
        return v


class UploadRequest(BaseModel):
    token: str | None = None
    filename: str
    mime_type: str | None = None
    size_bytes: int | None = None


class UploadResponse(BaseModel):
    upload_url: str
    fields: dict[str, str] | None = None
    object_key: str
    content_type: str


class ReadRequest(BaseModel):
    token: str | None = None
    object_key: str
    service: str = "media"

    @field_validator("service")
    @classmethod
    def validate_service(cls, v: str) -> str:
        if v not in MEDIA_SERVICE_ALLOWLIST:
            raise ValueError(f"service must be one of {sorted(MEDIA_SERVICE_ALLOWLIST)}, got '{v}'")
        return v


class ReadResponse(BaseModel):
    read_url: str
    expires_in: int


class MetadataCreate(BaseModel):
    model_config = ConfigDict(extra="allow")
    url: str
    filename: str
    service: str = "media"
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

    @field_validator("service")
    @classmethod
    def validate_service(cls, v: str) -> str:
        if v not in MEDIA_SERVICE_ALLOWLIST:
            raise ValueError(f"service must be one of {sorted(MEDIA_SERVICE_ALLOWLIST)}, got '{v}'")
        return v


class MetadataRecord(BaseModel):
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
