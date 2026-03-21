FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# We expect the build context to be the project root
COPY categorization-engine/requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

# Copy proto declarations
COPY proto /proto

# Copy the engine implementation
COPY categorization-engine /app

# Generate the gRPC stubs inside the container
RUN python -m grpc_tools.protoc -I/proto --python_out=/app --grpc_python_out=/app /proto/categorization.proto

# Create a data directory for the model file
RUN mkdir -p /app/data

CMD ["python", "server.py"]
