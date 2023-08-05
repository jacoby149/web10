
FROM --platform=linux/x86_64 python:3.9

RUN apt-get update

RUN apt-get -y install libsasl2-dev libldap2-dev libssl-dev

WORKDIR /web10

COPY ./requirements.txt /web10/requirements.txt

RUN cat requirements.txt | xargs -n 1 -L 1 pip install

COPY ./app /web10/app

CMD gunicorn -b 0.0.0.0:80 -w 4 -k uvicorn.workers.UvicornWorker app.main:app