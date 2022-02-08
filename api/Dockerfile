
FROM python:3.9

WORKDIR /web10

COPY ./requirements.txt /web10/requirements.txt

RUN pip install --no-cache-dir --upgrade -r /web10/requirements.txt

COPY ./app /web10/app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80", "--reload"]