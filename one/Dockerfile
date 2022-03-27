FROM python:3.9
WORKDIR /one/server
COPY server/requirements.txt one/server/requirements.txt
RUN pip install -r one/server/requirements.txt
COPY . one/
RUN . one/server/.env
RUN export FLASK_APP=server.py
CMD FLASK_DEBUG=1;python3 -m flask run --port=80 --host=0.0.0.0