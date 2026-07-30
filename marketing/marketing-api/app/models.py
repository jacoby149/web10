from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Phase(str, Enum):
    PENDING = "pending"
    PARSING = "parsing"
    MAPPING = "mapping"
    VALIDATING = "validating"
    UPLOADING_MEDIA = "uploading_media"
    WRITING = "writing"
    COMPLETE = "complete"
    ERROR = "error"


class ImportJobCreate(BaseModel):
    """Initiate a new import job. The client uploads the ZIP via the returned upload URL."""

    platform: Optional[str] = None  # instagram, facebook, youtube (or None for auto-detect)
    user_token: str = Field(..., description="web10 JWT for the target node")
    node_api_url: str = Field(..., description="Target node API URL, e.g. https://api.web10.app")


class ImportPresignRequest(BaseModel):
    """Request a presigned S3 POST for uploading a ZIP import file."""

    platform: Optional[str] = None
    user_token: str = Field(..., description="web10 JWT for the target node")
    node_api_url: str = Field(..., description="Target node API URL, e.g. https://api.web10.app")


class ImportPresignResponse(BaseModel):
    """Returned after creating a job; the client uses these to POST the ZIP directly to S3."""

    job_id: str
    upload_url: str
    fields: dict[str, str]
    object_key: str


class ImportJob(BaseModel):
    id: str
    platform: Optional[str] = None
    phase: Phase = Phase.PENDING
    total_files: int = 0
    processed_files: int = 0
    total_records: int = 0
    written_records: int = 0
    skipped_records: int = 0
    errors: list[str] = Field(default_factory=list)
    current_service: Optional[str] = None
    message: Optional[str] = None
    services_summary: dict = Field(default_factory=dict)
    created_at: Optional[str] = None


class PageView(BaseModel):
    """Simple analytics event."""

    path: str
    referrer: Optional[str] = None
    user_agent: Optional[str] = None


class FunnelEvent(str, Enum):
    LANDING = "landing"
    DOCS_VIEW = "docs_view"
    APP_STORE_VIEW = "app_store_view"
    EXPORTER_VIEW = "exporter_view"
    TRENDING_VIEW = "trending_view"
    EXPORT_STARTED = "export_started"
    EXPORT_COMPLETE = "export_complete"
    SIGN_IN_CLICK = "sign_in_click"
    SIGN_UP_CLICK = "sign_up_click"
    GITHUB_CLICK = "github_click"
    ENTER_CLICK = "enter_click"


class FunnelEventCreate(BaseModel):
    event: FunnelEvent
    metadata: dict = Field(default_factory=dict)


class JsErrorReport(BaseModel):
    """Client-side JS error beacon — no content, no PII."""

    message: str = Field(..., max_length=2000, description="Error message or stack snippet")
    source: Optional[str] = Field(None, max_length=500, description="Script filename or URL")
    line: Optional[int] = None
    column: Optional[int] = None
    app: str = Field(..., description="App name: marketing-ui, web10-social, ui")
    route: str = Field(..., description="Current URL path")
    user_agent: Optional[str] = Field(None, max_length=500)


class FeedbackCreate(BaseModel):
    """User bug report / feedback submission."""

    message: str = Field(..., min_length=1, max_length=5000)
    contact: Optional[str] = Field(None, max_length=200)
    app: str = Field(..., description="App name: web10-social, marketing-ui, etc.")
    route: str = Field(..., description="Current URL path")
    version: Optional[str] = Field(None, description="App version or git commit")
    user_agent: Optional[str] = Field(None, max_length=500)
    console_errors: list[str] = Field(default_factory=list, description="Recent console errors captured client-side")
    stack_trace: Optional[str] = Field(None, max_length=10000, description="From error boundary catch")
