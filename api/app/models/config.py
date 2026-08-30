from pydantic import BaseModel, ConfigDict


class NodeConfig(BaseModel):
    """Full node configuration document."""

    model_config = ConfigDict(extra="allow")

    provider: str = "api.localhost"
    db_url: str = ""
    db_name: str = "web10"
    algorithm: str = "HS256"
    token_expire_minutes: int = 87840

    # Policy flags
    beta_required: bool = False
    verify_required: bool = False
    pay_required: bool = False
    beta_code: str = ""

    # Free tier defaults
    free_credits: float = 0.10
    free_space: int = 8

    # CORS
    cors_service_managers: str = "auth.localhost"

    # S3 / Media
    s3_endpoint: str = "http://minio:9000"
    s3_bucket: str = "web10-media"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False
    max_upload_size: int = 524288000  # ~500MB

    # Twilio (optional)
    twilio_service: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_number: str = ""

    # Stripe (optional)
    stripe_status: str = "test"
    stripe_test_key: str = ""
    stripe_live_key: str = ""
    stripe_test_credit_sub_id: str = ""
    stripe_test_space_sub_id: str = ""
    stripe_live_credit_sub_id: str = ""
    stripe_live_space_sub_id: str = ""

    # Dev pay
    dev_pay_pct: int = 98

    # Telemetry (D56) — public analytics IDs, admin-set in the Node Config
    # UI. Served to every surface at runtime via GET /telemetry. Empty = off.
    ga4_measurement_id: str = ""
    hotjar_site_id: str = ""

    # Content moderation (D58) — sensitive-language detection + discover
    # suppression. The blocklist is a JSON array of words (whole-word,
    # case-insensitive). auto_moderate auto-hides matching posts from the
    # discover board. auto_hide_users is a list of usernames whose future
    # posts are always auto-hidden. moderation_enabled is the master switch.
    sensitive_words: list[str] = []
    auto_moderate: bool = True
    moderation_enabled: bool = True
    auto_hide_users: list[str] = []

    # Branding
    brand_text: str = "web10"
    logo_dark: str = ""
    logo_light: str = ""


class SetupRequest(BaseModel):
    """First-run setup wizard payload."""

    provider: str
    admin_username: str
    admin_password: str
    db_url: str = "mongodb://ferretdb:27017"
    db_name: str = "web10"
    brand_text: str = "web10"
    beta_required: bool = False
    verify_required: bool = False
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
    stripe_test_key: str = ""
    stripe_live_key: str = ""


class SetupStatus(BaseModel):
    """Response from GET /setup."""

    configured: bool
    has_admin: bool


class AppApprovalRequest(BaseModel):
    """Admin toggles an app's visibility in the public App Store (v2)."""

    token: str
    url: str
    approved: bool = True
    reviewer_note: str = ""


class AppRatingRequest(BaseModel):
    """User submits a 1-5 star rating for an app."""

    token: str
    target_app_id: str
    rating: int


class AppAdminQuery(BaseModel):
    """Admin lists all registered apps (approved + pending)."""

    token: str


class DiscoveryModerationRequest(BaseModel):
    """Admin hides or restores a post on the public discovery board.

    Board-level takedown: sets a sticky ``removed`` flag on the discovery
    index document. The author's underlying record is never touched (I3).
    """

    token: str
    author: str
    service: str
    post_id: str
    reason: str = ""


class ConfigUpdate(BaseModel):
    """Partial config update — only provided fields are changed."""

    model_config = ConfigDict(extra="allow")
    provider: str | None = None
    beta_required: bool | None = None
    verify_required: bool | None = None
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
    stripe_status: str | None = None
    stripe_test_key: str | None = None
    stripe_live_key: str | None = None
    stripe_test_credit_sub_id: str | None = None
    stripe_test_space_sub_id: str | None = None
    stripe_live_credit_sub_id: str | None = None
    stripe_live_space_sub_id: str | None = None
    dev_pay_pct: int | None = None
    ga4_measurement_id: str | None = None
    hotjar_site_id: str | None = None
    sensitive_words: list[str] | None = None
    auto_moderate: bool | None = None
    moderation_enabled: bool | None = None
    auto_hide_users: list[str] | None = None
    brand_text: str | None = None
    logo_dark: str | None = None
    logo_light: str | None = None
    token_expire_minutes: int | None = None
    admins: list[str] | None = None
