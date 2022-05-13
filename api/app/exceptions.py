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

BAD_USERNAME = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="usernames take only alphanumeric characters",
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
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="your token do not have access to admin functions",
    headers={"WWW-Authenticate": "Basic"},
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
    headers={"WWW-Authenticate": "Basic"},
)