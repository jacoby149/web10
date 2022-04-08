from pydantic import BaseModel
from typing import Optional


class dotdict(dict):
    """dot.notation access to dictionary attributes"""
    __getattr__ = dict.get
    __setattr__ = dict.__setitem__
    __delattr__ = dict.__delitem__


class Token(BaseModel):
    token: Optional[str] = None
    query: Optional[dict] = None
    update: Optional[dict] = None
    pull: Optional[dict] = None

class PayData(BaseModel):
    token: str
    seller: str
    title: str
    price: Optional[int] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None

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
    phone: Optional[str] = None
    betacode:Optional[str]=None
    # change variables 
    new_pass: Optional[str] = None

class TokenForm(BaseModel):
    username: str
    password: Optional[str] = None
    token: Optional[str] = None  # authorize via. user pass or token to get a token
    site: Optional[str] = None
    target: Optional[str] = None