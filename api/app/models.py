
from pydantic import BaseModel, ConfigDict


class dotdict(dict):
    """dot.notation access to dictionary attributes"""
    __getattr__ = dict.get
    __setattr__ = dict.__setitem__
    __delattr__ = dict.__delitem__


class Token(BaseModel):
    model_config = ConfigDict(extra="allow")

    token: str | None = None
    query: dict | None = None
    update: dict | None = None
    pull: dict | None = None

class PayData(BaseModel):
    token: str
    seller: str
    title: str
    price: int | None = None
    success_url: str | None = None
    cancel_url: str | None = None

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
        # expiration, and provider aren't included in token forms
        # they are added to the token in create_web10_token


class SignUpForm(BaseModel):
    username: str
    password: str
    phone: str | None = None
    betacode:str | None=None
    # change variables
    new_pass: str | None = None

class TokenForm(BaseModel):
    username: str
    password: str | None = None
    token: str | None = None  # authorize via. user pass or token to get a token
    site: str | None = None
    target: str | None = None

class PhoneForm(BaseModel):
    phone_number:str
