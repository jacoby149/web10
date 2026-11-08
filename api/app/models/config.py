from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SetupRequest(BaseModel):
    """First-run setup wizard payload."""

    provider: str
    admin_username: str
    admin_password: str
    db_url: str = ""
    db_name: str = "web10"
    brand_text: str = "web10"
    beta_required: bool = False
    verify_required: bool = False
    require_contact: bool = False
    pay_required: bool = False
    beta_code: str = ""
    free_credits: float = 0.10
    free_space: int = 8
    cors_service_managers: str = "auth.localhost"
    s3_endpoint: str = "http://minio:9000"
    s3_bucket: str = "web10-media"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    twilio_service: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_number: str = ""


class SetupStatus(BaseModel):
    """Response from GET /setup."""

    configured: bool
    has_admin: bool


class ConfigUpdate(BaseModel):
    """Partial config update — only provided fields are changed."""

    model_config = ConfigDict(extra="allow")
    provider: str | None = None
    beta_required: bool | None = None
    verify_required: bool | None = None
    require_contact: bool | None = None
    pay_required: bool | None = None
    beta_code: str | None = None
    free_credits: float | None = None
    free_space: int | None = None
    cors_service_managers: str | None = None
    s3_endpoint: str | None = None
    s3_bucket: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str | None = None
    s3_use_ssl: bool | None = None
    max_upload_size: int | None = None
    twilio_service: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_number: str | None = None
    dev_pay_pct: int | None = None
    posthog_enabled: bool | None = None
    posthog_replay_enabled: bool | None = None
    posthog_project_key: str | None = Field(default=None, pattern=r"^(?:phc_[A-Za-z0-9_-]{8,200})?$")
    posthog_host: Literal["https://us.i.posthog.com", "https://eu.i.posthog.com"] | None = None
    sensitive_words: list[str] | None = None
    auto_moderate: bool | None = None
    moderation_enabled: bool | None = None
    auto_hide_users: list[str] | None = None
    node_ad_percentage: int | None = None
    node_ad_overwrite: bool | None = None
    brand_text: str | None = None
    logo_dark: str | None = None
    logo_light: str | None = None
    token_expire_minutes: int | None = None
    admins: list[str] | None = None
