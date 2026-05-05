from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MyTrackr OCR Service", version="3.0.0")

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
OCR_TIMEOUT_SECONDS = 120
OCR_SKIP_FLAG = "--skip-text"


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Read text from a searchable PDF."""
    try:
        with fitz.open(pdf_path) as document:
            return "\n".join(page.get_text() for page in document).strip()
    except Exception as exc:
        logger.error("Failed to extract text from OCR output: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="OCR completed but text extraction from output PDF failed",
        ) from exc


def get_pdf_page_count(pdf_path: Path) -> int:
    """Return the number of pages in the PDF."""
    try:
        with fitz.open(pdf_path) as document:
            return len(document)
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


@app.get("/health")
async def health_check():
    version = get_ocrmypdf_version()
    engine_ready = version != "unknown"

    return {
        "status": "healthy" if engine_ready else "degraded",
        "engine": "ocrmypdf",
        "engine_ready": engine_ready,
        "ocrmypdf_version": version,
        "ocr_args": [OCR_SKIP_FLAG],
        "version": "3.0.0",
    }


@app.post("/ocr/pdf")
async def ocr_pdf(file: UploadFile = File(...)):
    """OCR a PDF using OCRmyPDF and keep existing text pages intact."""
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
