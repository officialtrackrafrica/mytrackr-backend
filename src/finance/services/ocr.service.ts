import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
const FormData = require('form-data');

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly ocrServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.ocrServiceUrl =
      this.configService.get<string>('OCR_SERVICE_URL') ||
      'http://localhost:8000';
  }

  /**
   * Extract text from a PDF using the OCR microservice.
   * Returns the extracted text or null if OCR fails.
   */
  async extractTextFromPdf(pdfBuffer: Buffer): Promise<string | null> {
    try {
      this.logger.log(
        `Sending PDF to OCR service (${this.ocrServiceUrl}) for text extraction...`,
      );

      const formData = new FormData();
      formData.append('file', pdfBuffer, {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      });

      const response = await axios.post(
        `${this.ocrServiceUrl}/ocr/pdf`,
        formData,
        {
          headers: formData.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 120000, // 2 minutes for OCR processing
        },
      );

      const result = response.data;

      if (result.success && result.text) {
        this.logger.log(
          `OCR extracted ${result.text.length} characters from ${result.pages} pages`,
        );
        return result.text;
      }

      this.logger.warn('OCR service returned no text');
      return null;
    } catch (error) {
      if (error.response) {
        this.logger.error(
          `OCR service returned ${error.response.status}: ${JSON.stringify(error.response.data)}`,
        );
      } else {
        this.logger.error(`OCR service call failed: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Check if the OCR service is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.ocrServiceUrl}/health`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
