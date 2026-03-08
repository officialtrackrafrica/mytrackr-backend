import {
  Controller,
  Post,
  Body,
  Headers,
  Param,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SubscriptionService } from '../services/subscription.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('payments/:provider')
  @HttpCode(200) // Webhooks must always return 200 OK fast
  @ApiOperation({ summary: 'Handle incoming webhooks from payment gateways' })
  async handlePaymentWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
    @Headers('x-paystack-signature') paystackSignature?: string,
    @Headers('stripe-signature') stripeSignature?: string,
  ) {
    // Determine which signature header to pass depending on the provider
    let signature: string | undefined = undefined;
    if (provider === 'paystack') signature = paystackSignature || undefined;
    if (provider === 'stripe') signature = stripeSignature || undefined;

    // Note: In production you should process this asynchronously (e.g. using a queue)
    // to ensure the webhook endpoint always responds within 2-3 seconds.
    // We await here for MVP simplicity.
    return this.subscriptionService.handleWebhook(provider, payload, signature);
  }
}
