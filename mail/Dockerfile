
FROM joseluisq/static-web-server:latest

WORKDIR /mail

ENV SERVER_DIRECTORY_LISTING true

COPY mail/. /mail/public

COPY auth/public/sdk/. /mail/public/sdk