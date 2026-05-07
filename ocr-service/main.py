from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MyTrackr OCR Service", version="3.0.0")

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
OCR_TIMEOUT_SECONDS = 120
OCR_SKIP_FLAG = "--skip-text"
EXTRACTED_TEXT_LOG_LIMIT = 4000


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract text from a searchable PDF using Poppler pdftotext."""
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            timeout=OCR_TIMEOUT_SECONDS,
            check=False,
        )
        if result.returncode != 0:
            error_output = (result.stderr or result.stdout).strip()
            raise RuntimeError(error_output or "pdftotext failed")
        return result.stdout.strip()
    except Exception as exc:
        logger.error("Failed to extract text from OCR output: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="OCR completed but text extraction from output PDF failed",
        ) from exc


def get_pdf_page_count(pdf_path: Path) -> int:
    """Return the number of pages in the PDF via Poppler pdfinfo."""
    try:
        result = subprocess.run(
            ["pdfinfo", str(pdf_path)],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if result.returncode != 0:
            return 0
        for line in result.stdout.splitlines():
            if line.startswith("Pages:"):
                return int(line.split(":", 1)[1].strip())
        return 0
    except Exception:
        return 0


def run_ocrmypdf(input_path: Path, output_path: Path) -> subprocess.CompletedProcess[str]:
    """Run OCRmyPDF with production-safe defaults."""
    command = [
        "ocrmypdf",
        OCR_SKIP_FLAG,
        "--output-type",
        "pdf",
        str(input_path),
        str(output_path),
    ]

    logger.info("Running OCRmyPDF command: %s", " ".join(command[:-2] + ["<input>", "<output>"]))

    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=OCR_TIMEOUT_SECONDS,
        check=False,
    )


def get_ocrmypdf_version() -> str:
    """Fetch OCRmyPDF version for health reporting."""
    try:
        result = subprocess.run(
            ["ocrmypdf", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if result.returncode == 0:
            return result.stdout.strip() or "unknown"
        return "unknown"
    except Exception:
        return "unknown"


def get_pdftotext_version() -> str:
    """Fetch pdftotext version for health reporting."""
    try:
        result = subprocess.run(
            ["pdftotext", "-v"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        output = ((result.stderr or "") + "\n" + (result.stdout or "")).strip()
        if result.returncode == 0 and output:
            return output.splitlines()[0].strip()
        return "unknown"
    except Exception:
        return "unknown"


@app.get("/health")
async def health_check():
    ocrmypdf_version = get_ocrmypdf_version()
    pdftotext_version = get_pdftotext_version()
    engine_ready = ocrmypdf_version != "unknown" and pdftotext_version != "unknown"

    return {
        "status": "healthy" if engine_ready else "degraded",
        "engine": "ocrmypdf",
        "engine_ready": engine_ready,
        "ocrmypdf_version": ocrmypdf_version,
        "pdftotext_version": pdftotext_version,
        "ocr_args": [OCR_SKIP_FLAG],
        "version": "3.0.0",
    }


@app.post("/ocr/pdf")
async def ocr_pdf(file: UploadFile = File(...)):
    """OCR a PDF using OCRmyPDF and extract text with Poppler pdftotext."""
    try:
        pdf_bytes = await file.read()

        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="Empty file provided")

        if len(pdf_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="File too large (max 50MB)")

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            input_path = tmp_path / "input.pdf"
            output_path = tmp_path / "output.pdf"
            input_path.write_bytes(pdf_bytes)

            result = run_ocrmypdf(input_path, output_path)

            if result.returncode != 0:
                error_output = (result.stderr or result.stdout).strip()
                logger.error("OCRmyPDF failed (%s): %s", result.returncode, error_output)
                raise HTTPException(
                    status_code=500,
                    detail=f"OCRmyPDF failed: {error_output or 'unknown error'}",
                )

            if not output_path.exists() or os.path.getsize(output_path) == 0:
                raise HTTPException(
                    status_code=500,
                    detail="OCRmyPDF did not produce an output PDF",
                )

            text = extract_text_from_pdf(output_path)
            pages = get_pdf_page_count(output_path)

            if text:
                logger.info(
                    "Extracted text preview for %s (%s chars, first %s chars): %s",
                    file.filename,
                    len(text),
                    EXTRACTED_TEXT_LOG_LIMIT,
                    text[:EXTRACTED_TEXT_LOG_LIMIT],
                )
            else:
                logger.warning("No text extracted from OCR output for %s", file.filename)

            logger.info(
                "OCRmyPDF completed for %s with --skip-text; extracted %s chars from %s pages",
                file.filename,
                len(text),
                pages,
            )

            return JSONResponse(
                content={
                    "success": True,
                    "text": text,
                    "method": "ocrmypdf",
                    "pages": pages,
                    "message": "OCRmyPDF completed successfully with --skip-text",
                }
            )
    except subprocess.TimeoutExpired as exc:
        logger.error("OCRmyPDF timed out: %s", exc)
        raise HTTPException(status_code=504, detail="OCR processing timed out") from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("OCR processing error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"OCR processing failed: {str(exc)}"
        ) from exc
