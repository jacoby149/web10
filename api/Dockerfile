
FROM --platform=linux/x86_64 python3.9-nodejs20

RUN apt-get update

RUN apt-get -y install libsasl2-dev libldap2-dev libssl-dev

WORKDIR /web10

COPY ./requirements.txt /web10/requirements.txt

RUN pip install pipenv && pipenv install

COPY ./app /web10/app

CMD pipenv run gunicorn -b 0.0.0.0:80 -w 4 -k uvicorn.workers.UvicornWorker app.main:app
