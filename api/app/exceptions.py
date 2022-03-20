from fastapi import HTTPException,status

LOGIN = HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

AUTH = HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

BETA = HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Wrong beta code entered",
                headers={"WWW-Authenticate": "Bearer"},
            )

TOKEN = HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect token",
                headers={"WWW-Authenticate": "Bearer"},
            )

CRUD = HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="CRUD access denied",
                headers={"WWW-Authenticate": "Bearer"},
            )

MINT = HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Submitted token can't mint desired token",
                headers={"WWW-Authenticate": "Bearer"},
            )