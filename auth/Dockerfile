FROM node:12-alpine
RUN mkdir /frontend
WORKDIR /frontend
COPY package.json /frontend/package.json
RUN npm install
COPY . /frontend
ADD http://jacobhoffman.tk/rectangles/Rectangles.js /frontend/src/rectangles/
CMD PORT=80 npm run start
 
