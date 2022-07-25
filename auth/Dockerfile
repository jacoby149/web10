FROM node:12-alpine
RUN mkdir /frontend
WORKDIR /frontend
COPY package.json /frontend/package.json
RUN npm install
RUN npm i -g serve
COPY . /frontend
CMD npm run build && PORT=80 serve -s build