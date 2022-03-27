FROM python:3.9
WORKDIR /subs/server
COPY server/requirements.txt subs/server/requirements.txt
RUN pip install -r subs/server/requirements.txt
COPY . subs/
RUN . subs/server/.env
CMD python3 -m flask run --port=80 --host=0.0.0.0