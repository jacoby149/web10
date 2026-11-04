"""Generic deferred create; no app-specific collection, audience or feed knowledge."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.services.deferred_store import CreateIntent, DeferredStore, fingerprint
from app.services.deferred_worker import actor_context
from app.v3.endpoints.multipart import _run
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["documents"])


class OperationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str
    operation_id: UUID
    service: str = Field(min_length=1, max_length=128)


class SubmitRequest(OperationRequest):
    intent: CreateIntent
    media_dependencies: list[str] = Field(min_length=1, max_length=8)


class ValidateRequest(OperationRequest):
    intent: CreateIntent


def view(job):
    return {
        "operation_id": job.operation_id,
        "phase": job.phase,
        "doc_id": job.doc_id if job.phase == "done" or job.error == "existing_result_requires_review" else None,
        "error": job.error,
        "expires_at": job.expires_at.isoformat(),
        "admitted": job.intent is not None,
        "media_dependencies": job.dependencies,
    }


def run(request, data, operation):
    # _run's verified owner adapter needs token/service and an operation UUID.
    class Adapter:
        token, service, session_id = data.token, data.service, data.operation_id

    return _run(
        request,
        Adapter(),
        lambda transport, owner, sid, deadline: operation(
            DeferredStore(transport.s3, transport.store.bucket), owner, sid
        ),
    )


@router.post("/create")
def submit(request: Request, data: SubmitRequest):
    def admit(store, owner, sid):
        if data.intent.service != data.service:
            raise HTTPException(400, "intent service mismatch")
        actor_context(owner, data.intent)
        for doc_id in data.media_dependencies:
            media = ch.get_document_version(doc_id, owner.username)
            if not media or media.get("deleted") or media.get("service") != "media_metadata":
                raise HTTPException(404, "owned media dependency not found")
        return view(store.submit(owner, sid, data.intent, data.media_dependencies))

    return run(request, data, admit)


@router.post("/validate")
def validate(request: Request, data: ValidateRequest):
    def check(store, owner, sid):
        if data.intent.service != data.service:
            raise HTTPException(400, "intent service mismatch")
        fingerprint(data.intent, ["0" * 128] * 8)
        actor_context(owner, data.intent)
        return {"allowed": True}

    return run(request, data, check)


@router.post("/status")
def status(request: Request, data: OperationRequest):
    return run(request, data, lambda store, owner, sid: view(store.get(owner, sid)))


@router.post("/cancel")
def cancel(request: Request, data: OperationRequest):
    return run(request, data, lambda store, owner, sid: view(store.cancel(owner, sid)))


@router.post("/retry")
def retry(request: Request, data: OperationRequest):
    def resume(store, owner, sid):
        job = store.get(owner, sid)
        if not job.intent:
            raise HTTPException(409, "operation is cancelled")
        if job.error == "existing_result_requires_review":
            raise HTTPException(409, "review the existing document and audience instead of replaying creation")
        actor_context(owner, job.intent)
        return view(store.change(job, "waiting"))

    return run(request, data, resume)
