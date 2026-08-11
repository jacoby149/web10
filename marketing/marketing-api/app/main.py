import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)

app = FastAPI(title="web10 Marketing API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── v3 Routers ──────────────────────────────────────────────────────────────
# All product endpoints are under /v3. Infrastructure endpoints are bare.
from .v3 import v3_router
app.include_router(v3_router, prefix="/v3")

# Legacy endpoints (backward compat, will be removed in v4)
app.include_router(v3_router, prefix="")
