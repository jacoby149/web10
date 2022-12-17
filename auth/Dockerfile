FROM node:14-alpine
WORKDIR auth
COPY auth/package.json /auth/package.json
RUN npm install
COPY sdk /auth/public/sdk
COPY auth/. /auth
RUN npm run build 
CMD npx react-inject-env set && PORT=80 serve -s build