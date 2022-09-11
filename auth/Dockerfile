FROM node:14-alpine
RUN mkdir /frontend
WORKDIR /frontend
COPY package.json /frontend/package.json
RUN npm install
COPY /public/sdk/package.json /frontend/public/sdk/package.json
RUN cd public/sdk && npm install
RUN npm i -g serve
COPY . /frontend
CMD npm run build && PORT=80 serve -s build