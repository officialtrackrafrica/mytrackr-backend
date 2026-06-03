FROM jbarlow83/ocrmypdf:latest

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3-pip \
    python3-venv \
    poppler-utils \
    procps \
    && rm -rf /var/lib/apt/lists/*

RUN /usr/bin/python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY ocr-service/requirements.txt ./
RUN /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY ocr-service /app

EXPOSE 8000

ENTRYPOINT []
CMD ["/opt/venv/bin/python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
