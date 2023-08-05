FROM --platform=linux/x86_64 node:14-alpine as dev
WORKDIR auth
COPY auth/package.json /auth/package.json
RUN npm install
RUN npm i -g serve
COPY sdk /auth/public/sdk
COPY auth/. /auth

FROM dev as deploy
RUN npm run build
CMD npx react-inject-env set && PORT=80 serve -s build