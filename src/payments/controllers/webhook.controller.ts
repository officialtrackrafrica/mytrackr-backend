import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  Param,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SubscriptionService } from '../services/subscription.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('payments/:provider')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle incoming webhooks from payment gateways' })
  async handleWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
    @Req() req: any,
    @Headers('x-paystack-signature') paystackSignature?: string,
  ) {
    let signature: string | undefined;
    if (provider === 'paystack') signature = paystackSignature || undefined;

    const logger = new Logger('WebhookController');
    logger.debug(
      `Webhook received for ${provider}. rawBody present: ${!!req.rawBody}`,
    );

    return this.subscriptionService.handleWebhook(
      provider,
      payload,
      signature,
      req.rawBody,
    );
  }
}
