FROM python:3.10-slim

WORKDIR /app

# Install system dependencies including Tesseract OCR
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY ocr-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY ocr-service /app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]