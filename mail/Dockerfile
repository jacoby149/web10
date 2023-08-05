
FROM --platform=linux/x86_64 joseluisq/static-web-server:latest

WORKDIR /mail

ENV SERVER_DIRECTORY_LISTING true

COPY mail/. /mail/public

COPY sdk/. /mail/public/sdk