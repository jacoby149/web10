from fastapi import APIRouter, Form, Response

from app.services import documentdb as db
from app.services import twilio as mobile
from app.services.auth import get_password_hash

router = APIRouter()


def recover(From: str):
    password = db.temp_pass(From, get_password_hash)
    return mobile.recovery_response(password)


@router.post("/recovery_bot")
async def recovery_bot(From: str = Form(...), Body: str = Form(...)):
    """Twilio webhook handler for password recovery SMS responses."""
    response = recover(From.replace("+", "")) if Body == "RESET" else mobile.actionless_response()
    return Response(content=str(response), media_type="application/xml")
