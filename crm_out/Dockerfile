
FROM python:3.9

WORKDIR /crm

COPY crm/. /crm

COPY auth/public/sdk/. /crm/sdk

CMD ["python", "-m", "http.server", "80"]