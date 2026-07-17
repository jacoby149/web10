from pydantic import BaseModel, ConfigDict


class Token(BaseModel):
    model_config = ConfigDict(extra="allow")

    token: str | None = None
    query: dict | None = None
    update: dict | None = None
    pull: dict | None = None
    pipeline: list | None = None


class TokenData(BaseModel):
    username: str = None
    site: str = None
    target: str = None
    provider: str = None
    expires: str = None

    def populate_from_payload(self, payload):
        self.username: str = payload.get("username")
        self.site: str = payload.get("site")
        self.target: str = payload.get("target")
        self.provider: str = payload.get("provider")
        self.expires: str = payload.get("expires")

    def populate_from_token_form(self, token_form):
        self.username: str = token_form.username
        self.site: str = token_form.site
        self.target: str = token_form.target


class SignUpForm(BaseModel):
    username: str
    password: str
    phone: str | None = None
    betacode: str | None = None
    new_pass: str | None = None


class TokenForm(BaseModel):
    username: str
    password: str | None = None
    token: str | None = None
    site: str | None = None
    target: str | None = None


class PhoneForm(BaseModel):
    phone_number: str
