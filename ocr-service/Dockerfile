FROM jbarlow83/ocrmypdf:latest

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3-pip \
    procps \
    && rm -rf /var/lib/apt/lists/*

COPY ocr-service/requirements.txt ./
RUN python3 -m pip install --no-cache-dir -r requirements.txt

COPY ocr-service /app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
