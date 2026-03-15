import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IPaymentGateway,
  InitializePaymentDto,
  VerifyPaymentResponse,
  PaymentWebhookEvent,
} from '../interfaces/payment.interface';
import * as crypto from 'crypto';

@Injectable()
export class PaystackService implements IPaymentGateway {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private configService: ConfigService) {
    const key = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    if (!key) {
      throw new Error(
        'PAYSTACK_SECRET_KEY must be defined in environment properties',
      );
    }
    this.secretKey = key.trim();
    this.logger.debug(
      `PaystackService initialized. Key prefix: ${this.secretKey.substring(0, 7)}...`,
    );
  }

  async initializePayment(payload: InitializePaymentDto): Promise<{
    authorizationUrl: string;
    reference: string;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          amount: Math.round(payload.amount), // Paystack expects integer in kobo
          email: payload.email,
          reference: payload.reference,
          metadata: payload.metadata,
          callback_url: this.configService.get<string>('PAYSTACK_CALLBACK_URL'),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.status) {
        throw new Error(
          data.message || 'Failed to initialize Paystack transaction',
        );
      }

      return {
        authorizationUrl: data.data.authorization_url,
        reference: data.data.reference,
      };
    } catch (error) {
      this.logger.error(`Paystack initialization error: ${error.message}`);
      throw new HttpException(
        {
          message: 'Payment initialization failed',
          cause: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
          signal: controller.signal,
        },
      );

      const data = await response.json();

      if (!response.ok || !data.status) {
        throw new Error(data.message || 'Failed to verify transaction');
      }

      const tx = data.data;

      let mappedStatus: 'success' | 'failed' | 'pending' = 'pending';
      if (tx.status === 'success') mappedStatus = 'success';
      else if (tx.status === 'failed' || tx.status === 'abandoned')
        mappedStatus = 'failed';

      return {
        status: mappedStatus,
        amount: tx.amount,
        currency: tx.currency,
        reference: tx.reference,
        gatewayReference: tx.id.toString(),
        customerCode: tx.customer?.customer_code,
        metadata: tx.metadata,
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`Paystack verification error: ${error.message}`);
      throw new HttpException(
        {
          message: 'Payment verification failed',
          cause: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async parseWebhookEvent(
    payload: any,
    signatureHeader?: string,
    rawBody?: Buffer,
  ): Promise<PaymentWebhookEvent | null> {
    if (signatureHeader) {
      const dataToVerify = rawBody || JSON.stringify(payload);
      const hash = crypto
        .createHmac('sha512', this.secretKey)
        .update(dataToVerify)
        .digest('hex');

      if (hash !== signatureHeader) {
        this.logger.error(`Invalid Paystack webhook signature detected.`);
        this.logger.debug(`Received signature: ${signatureHeader}`);
        this.logger.debug(`Calculated hash: ${hash}`);
        this.logger.debug(`Raw body present: ${!!rawBody}`);
        this.logger.debug(`Raw body length: ${rawBody?.length || 0}`);
        throw new HttpException(
          'Invalid webhook signature',
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    await Promise.resolve();

    return {
      event: payload.event,
      data: payload.data,
    };
  }
}
