FROM node:15-alpine
RUN mkdir /rtc
WORKDIR /rtc
RUN npm i -g nodemon
COPY package.json /rtc/package.json
RUN npm install
COPY . /rtc
CMD node index.js