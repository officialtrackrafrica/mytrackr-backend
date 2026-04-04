from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import fitz  # PyMuPDF
from paddleocr import PaddleOCR
from PIL import Image
import io
import os
import logging
import base64
import numpy as np
from typing import Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MyTrackr OCR Service", version="1.0.1")

# Initialize PaddleOCR (lazy load on first request)
ocr_engine: Optional[PaddleOCR] = None


def get_ocr_engine() -> PaddleOCR:
    """Lazy load PaddleOCR engine on first use."""
    global ocr_engine
    if ocr_engine is None:
        logger.info("Initializing PaddleOCR engine...")
        # use_gpu=False for CPU-only mode (set True if GPU available)
        use_gpu = os.getenv("USE_GPU", "false").lower() == "true"
        ocr_engine = PaddleOCR(
            use_angle_cls=True,
            lang="en",
            use_gpu=use_gpu,
            show_log=False,
            page_num=100,  # Max pages to process
        )
        logger.info("PaddleOCR engine initialized successfully")
    return ocr_engine


def extract_text_directly(pdf_bytes: bytes) -> str:
    """
    Attempt to extract text directly from the PDF structure using PyMuPDF.
    This is much faster and more accurate for searchable PDFs.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        for page in doc:
            full_text += page.get_text() + "\n"
        doc.close()
        return full_text.strip()
    except Exception as e:
        logger.warning(f"Direct text extraction failed: {e}")
        return ""


def pdf_to_images(pdf_bytes: bytes) -> list:
    """Convert PDF bytes to list of images (one per page)."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            # Render page at 300 DPI for good OCR quality
            mat = fitz.Matrix(300 / 72, 300 / 72)
            pix = page.get_pixmap(matrix=mat)
            
            # Convert to PIL Image
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
        
        doc.close()
        logger.info(f"Rendered {len(images)} pages from PDF for OCR")
        return images
    except Exception as e:
        logger.error(f"Error converting PDF to images: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {str(e)}")


def extract_text_from_image(ocr: PaddleOCR, image: Image.Image) -> str:
    """Extract text from a single image using PaddleOCR."""
    # Convert PIL to numpy array
    img_array = np.array(image)
    
    # Run OCR
    result = ocr.ocr(img_array, cls=True)
    
    # Extract text from results
    texts = []
    if result and result[0]:
        for line in result[0]:
            if line and len(line) >= 2:
                # line format: [[box], [text, confidence]]
                text_info = line[1]
                if text_info and len(text_info) >= 1:
                    texts.append(text_info[0])
    
    return "\n".join(texts)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    engine_ready = ocr_engine is not None
    return {
        "status": "healthy",
        "engine_ready": engine_ready,
        "version": "1.0.1"
    }


@app.post("/ocr/pdf")
async def ocr_pdf(file: UploadFile = File(...)):
    """
    Hybrid text extraction from a PDF file.
    1. Try direct extraction (fast, accurate for searchable PDFs).
    2. Fallback to PaddleOCR if no text is found (for scanned/image PDFs).
    """
    try:
        # Read file
        pdf_bytes = await file.read()
        
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="Empty file provided")
        
        # Check file size (limit to 50MB)
        if len(pdf_bytes) > 50 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large (max 50MB)")

        # --- Phase 1: Direct Extraction ---
        logger.info(f"Attempting direct text extraction for {file.filename}...")
        direct_text = extract_text_directly(pdf_bytes)
        
        # If we got significant text (at least 100 chars), return it immediately
        if len(direct_text) > 100:
            logger.info(f"Direct extraction successful ({len(direct_text)} chars). Skipping OCR.")
            return JSONResponse(content={
                "success": True,
                "text": direct_text,
                "method": "direct",
                "message": "Text extracted directly from PDF structure"
            })
            
        logger.info("Direct extraction returned minimal text. Falling back to full OCR...")

        # --- Phase 2: OCR Fallback ---
        # Get OCR engine
        ocr = get_ocr_engine()
        
        # Convert PDF to images
        images = pdf_to_images(pdf_bytes)
        
        if not images:
            raise HTTPException(status_code=400, detail="No pages found in PDF")
        
        # Extract text from each page
        all_text = []
        for i, image in enumerate(images):
            logger.info(f"OCR processing page {i+1}/{len(images)}")
            page_text = extract_text_from_image(ocr, image)
            all_text.append(page_text)
        
        # Combine all text
        full_text = "\n\n".join(all_text)
        
        return JSONResponse(content={
            "success": True,
            "text": full_text,
            "method": "ocr",
            "pages": len(images),
            "message": "OCR completed successfully"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR processing error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


@app.post("/ocr/image")
async def ocr_image(file: UploadFile = File(...)):
    """
    Extract text from a single image (PNG, JPG, etc.) using PaddleOCR.
    """
    try:
        # Read file
        image_bytes = await file.read()
        
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Empty file provided")
        
        # Get OCR engine
        ocr = get_ocr_engine()
        
        # Convert to PIL Image
        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")
        
        # Extract text
        text = extract_text_from_image(ocr, image)
        
        return JSONResponse(content={
            "success": True,
            "text": text,
            "method": "ocr",
            "message": "OCR completed successfully"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR processing error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
