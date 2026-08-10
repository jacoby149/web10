from fastapi import APIRouter

from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import ConfirmMedia, DeleteMedia, ListMedia
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["media"])


@router.post("/confirm")
async def confirm_media(data: ConfirmMedia):
    """Confirm a media upload by storing metadata."""
    user = _user(data)
    return ch.confirm_media_upload(user, data.body)


@router.post("/list")
async def list_media(data: ListMedia):
    """List media for the user."""
    user = _user(data)
    return ch.list_media(user, limit=data.limit, offset=data.offset)


@router.post("/delete")
async def delete_media(data: DeleteMedia):
    """Delete a media record."""
    user = _user(data)
    ch.delete_media(user, data.doc_id)
    return {"doc_id": data.doc_id, "status": "deleted"}
