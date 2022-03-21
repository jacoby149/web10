FROM node:12-alpine
RUN mkdir /frontend
WORKDIR /frontend
COPY package.json /frontend/package.json
RUN npm install
COPY . /frontend
CMD PORT=80 npm run start
 
