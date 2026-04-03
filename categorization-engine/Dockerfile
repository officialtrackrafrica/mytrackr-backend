FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1

WORKDIR /app


COPY categorization-engine/requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt


COPY src/proto /proto


COPY categorization-engine /app


RUN python -m grpc_tools.protoc -I/proto --python_out=/app --grpc_python_out=/app /proto/categorization.proto


RUN mkdir -p /app/data

CMD ["python", "server.py"]
