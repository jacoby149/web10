FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /web10

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-cache

COPY ./app /web10/app

CMD ["uv", "run", "gunicorn", "-b", "0.0.0.0:80", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "app.main:app"]
