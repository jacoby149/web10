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
    detail="username with $./ characters",
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

EXISTS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="the user already exists",
    headers={"WWW-Authenticate": "Basic"},
)