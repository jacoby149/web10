
FROM --platform=linux/x86_64 joseluisq/static-web-server:latest

WORKDIR /crm

COPY crm/. /crm/public

COPY sdk/. /crm/public/sdk

ENV SERVER_DIRECTORY_LISTING true