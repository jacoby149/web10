from fastapi import HTTPException, status

LOGIN = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="incorrect username or password",
    headers={"WWW-Authenticate": "Basic"},
)

AUTH = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="incorrect username or password",
    headers={"WWW-Authenticate": "Basic"},
)

NO_PWA = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="no manifest.json found.",
    headers={"WWW-Authenticate": "Basic"},
)

BAD_USERNAME = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="username must be 1-30 lowercase letters, digits, or hyphens (no leading/trailing hyphens)",
    headers={"WWW-Authenticate": "Basic"},
)

BAD_PASSWORD = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="password must not be empty",
    headers={"WWW-Authenticate": "Basic"},
)

BETA = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="wrong beta code entered",
    headers={"WWW-Authenticate": "Basic"},
)

TOKEN = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="incorrect token",
    headers={"WWW-Authenticate": "Basic"},
)

CRUD = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="crud access denied",
    headers={"WWW-Authenticate": "Basic"},
)

MINT = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="submitted token can't mint desired token",
    headers={"WWW-Authenticate": "Basic"},
)

STAR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="can't modify the star service",
    headers={"WWW-Authenticate": "Basic"},
)

DSTAR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="can't duplicate the star service",
    headers={"WWW-Authenticate": "Basic"},
)

DUPLICATE_SERVICE = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="a terms record for this service already exists — update it instead of creating a duplicate",
)

RESERVED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="the username 'web10' is reserved",
    headers={"WWW-Authenticate": "Basic"},
)

NO_USER = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="the user doesn't exist",
    headers={"WWW-Authenticate": "Basic"},
)

NO_SELLER = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="the seller doesn't exist",
    headers={"WWW-Authenticate": "Basic"},
)


EXISTS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="the user already exists",
    headers={"WWW-Authenticate": "Basic"},
)

PHONE_NUMBER_TAKEN = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="that phone number is already linked to an account",
    headers={"WWW-Authenticate": "Basic"},
)

PHONE_NUMBER_MISSING = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="phone number missing",
    headers={"WWW-Authenticate": "Basic"},
)

NOT_ADMIN = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="This account is not an admin of this node.",
)

VERIFY = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="please verify your phone number to do that.",
    headers={"WWW-Authenticate": "Basic"},
)

WRONG_CODE = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="entered verification code is wrong",
    headers={"WWW-Authenticate": "Basic"},
)

PIPELINE = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="aggregation pipeline uses a stage or operator that isn't allowed",
)

PIPELINE_CAP = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="aggregation pipeline exceeds a resource cap",
)

TIME = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="ran out of credits",
    headers={"WWW-Authenticate": "Basic"},
)

SPACE = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="ran out of space",
    headers={"WWW-Authenticate": "Basic"},
)

BAD_NUM = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Phone number failure.",
    headers={"WWW-Authenticate": "Basic"},
)

BUSINESS_NOT_READY = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Business hasn't filled out their banking details yet.",
    headers={"WWW-Authenticate": "Basic"},
)

PHONE_NUMBER_NOT_REGISTERED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Phone number isn't registered with a web10 account.",
)

BAD_EMAIL = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="invalid email address",
)

EMAIL_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="no email registered for this account",
)

EMAIL_TAKEN = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="that email is already linked to another account",
)

BAD_CONTACT = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="enter a valid phone number or email address",
)

CONTACT_REQUIRED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="this node requires a phone number or email address",
)

CONTACT_NOT_LINKED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="that account isn't linked to this phone or email",
    headers={"WWW-Authenticate": "Basic"},
)

EXPIRED_CODE = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="verification code has expired",
)

SCHEMA_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="schema not found",
)

NOT_AUTHOR = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="only the author may modify this resource",
)

ENTRY_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="entry not found",
)

APP_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="app not found",
)

RATE_LIMIT = HTTPException(
    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
    detail="too many requests — try again later",
)

SCHEMA_INVALID = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="payload does not match the registered schema",
)
