FROM node:12-alpine
RUN mkdir /frontend
WORKDIR /frontend
COPY package.json /frontend/package.json
RUN npm install
RUN npm i -g serve
COPY . /frontend
RUN npm run build
CMD PORT=80 serve -s build