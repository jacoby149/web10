FROM --platform=linux/amd64 nikolaik/python-nodejs:python3.9-nodejs18

RUN apt-get update

RUN apt-get -y install libsasl2-dev libldap2-dev libssl-dev

RUN npm install -g @bitwarden/cli

WORKDIR /web10

COPY ./Pipfile /web10/Pipfile

COPY ./Pipfile.lock /web10/Pipfile.lock

RUN pip install pipenv && pipenv install

COPY ./app /web10/app

CMD pipenv run gunicorn -b 0.0.0.0:80 -w 4 -k uvicorn.workers.UvicornWorker app.main:app
