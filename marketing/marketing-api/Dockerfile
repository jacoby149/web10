# Mirrored to our GHCR namespace (ghcr-mirror.yml) — see e2e/mirror-images.json.
FROM ghcr.io/jacoby149/base-python:3.12-slim AS build
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv && uv sync --frozen

FROM ghcr.io/jacoby149/base-python:3.12-slim
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY app ./app
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 80
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]