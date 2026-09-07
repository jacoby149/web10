from pydantic import BaseModel


class Signup(BaseModel):
    username: str
    password: str
    phone: str | None = None
    email: str | None = None


class Login(BaseModel):
    username: str
    password: str
    site: str | None = None


class ChangePass(BaseModel):
    token: str
    password: str
    new_pass: str


class ChangePhone(BaseModel):
    token: str
    phone: str


class SetEmail(BaseModel):
    token: str
    email: str


class VerifyCode(BaseModel):
    token: str
    code: str


class SetRecoveryPhone(BaseModel):
    token: str
    phone: str


# Contact-anchored auth (D61) — unauthenticated; the contact + code are the
# credential. `contact` is a phone number OR an email.
class RecoveryRequest(BaseModel):
    contact: str


class RecoveryVerify(BaseModel):
    contact: str
    code: str


class RecoveryComplete(BaseModel):
    verify_token: str
    username: str
    new_password: str | None = None
