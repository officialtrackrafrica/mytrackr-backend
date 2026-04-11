import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  Patch,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { SubscriptionService } from '../services/subscription.service';
import {
  InitializeSubscriptionDto,
  UpdatePlanPriceDto,
  PlanResponseDto,
  SubscriptionStatusResponseDto,
  SubscriptionInitResponseDto,
  AdditionalBankAccountFeeStatusDto,
  BillingHistoryItemDto,
  StoreBillingCardDto,
  BillingCardMetadataDto,
} from '../dto/subscription.dto';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { SWAGGER_TAGS } from '../../common/docs';
import { ErrorResponseDto } from '../../common/errors';

@ApiTags(SWAGGER_TAGS[9].name)
@ApiCookieAuth('accessToken')
@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get all available subscription plans' })
  @ApiResponse({
    status: 200,
    description: 'List of active plans',
    type: [PlanResponseDto],
  })
  async getPlans() {
    return this.subscriptionService.getAllPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-plan')
  @ApiOperation({ summary: 'Get current user subscription status' })
  @ApiResponse({
    status: 200,
    description: 'Current active plan and expiration date',
    type: SubscriptionStatusResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    type: ErrorResponseDto,
  })
  async getMyPlan(@Req() req: any) {
    return this.subscriptionService.getUserSubscriptionStatus(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('billing-history')
  @ApiOperation({
    summary: 'Get billing history for the authenticated user',
    description:
      'Returns subscription and one-off payment attempts, including successful and failed payments.',
  })
  @ApiResponse({
    status: 200,
    description: 'Billing history ordered by newest first',
    type: [BillingHistoryItemDto],
  })
  async getBillingHistory(@Req() req: any) {
    return this.subscriptionService.getBillingHistory(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('billing-card')
  @ApiOperation({
    summary: 'Get stored billing card metadata for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Stored billing card metadata',
    type: BillingCardMetadataDto,
  })
  async getBillingCard(@Req() req: any) {
    return this.subscriptionService.getBillingCard(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('billing-card')
  @ApiOperation({
    summary: 'Store Paystack billing card metadata for the authenticated user',
  })
  @ApiBody({ type: StoreBillingCardDto })
  @ApiResponse({
    status: 201,
    description: 'Billing card stored successfully',
    type: BillingCardMetadataDto,
  })
  async storeBillingCard(@Req() req: any, @Body() dto: StoreBillingCardDto) {
    return this.subscriptionService.storeBillingCard(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('billing-card/change')
  @ApiOperation({
    summary: 'Replace the billing card for the current subscription',
  })
  @ApiBody({ type: StoreBillingCardDto })
  @ApiResponse({
    status: 200,
    description: 'Billing card changed successfully',
    type: BillingCardMetadataDto,
  })
  @ApiResponse({
    status: 400,
    description: 'No active subscription or invalid billing card metadata',
    type: ErrorResponseDto,
  })
  async changeBillingCard(@Req() req: any, @Body() dto: StoreBillingCardDto) {
    return this.subscriptionService.changeBillingCard(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  @ApiOperation({
    summary: 'Initialize a new premium subscription payment',
    description:
      'Starts the recurring billing flow. If no planId is provided, it defaults to the system "Premium" plan.',
  })
  @ApiResponse({
    status: 201,
    description: 'Returns payment authorization URL',
    type: SubscriptionInitResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid plan or initialized failed',
    type: ErrorResponseDto,
  })
  async subscribe(@Req() req: any, @Body() dto?: InitializeSubscriptionDto) {
    return this.subscriptionService.initializeSubscription(req.user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('additional-bank-accounts/fee')
  @ApiOperation({
    summary: 'Get the current pricing and slot status for additional bank accounts',
  })
  @ApiResponse({
    status: 200,
    description: 'Current additional bank account fee and entitlement status',
    type: AdditionalBankAccountFeeStatusDto,
  })
  async getAdditionalBankAccountFeeStatus(@Req() req: any) {
    return this.subscriptionService.getAdditionalBankAccountFeeStatus(
      req.user.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('additional-bank-accounts/checkout')
  @ApiOperation({
    summary: 'Initialize payment for one additional linked bank account slot',
  })
  @ApiResponse({
    status: 201,
    description: 'Returns payment authorization URL',
    type: SubscriptionInitResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Additional account payment is not currently required or cannot be initialized',
    type: ErrorResponseDto,
  })
  async initializeAdditionalBankAccountCheckout(@Req() req: any) {
    return this.subscriptionService.initializeAdditionalBankAccountCheckout(
      req.user,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('cancel')
  @ApiOperation({
    summary: 'Cancel the current subscription',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription cancelled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'No active subscription found',
    type: ErrorResponseDto,
  })
  async cancelSubscription(@Req() req: any) {
    return this.subscriptionService.cancelSubscription(req.user.id);
  }

  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @Patch('plans/:id/price')
  @ApiOperation({
    summary: 'Update the price of a subscription plan (Admin only)',
  })
  @ApiBody({ type: UpdatePlanPriceDto })
  @ApiResponse({
    status: 200,
    description: 'The updated plan',
    type: PlanResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Admin privileges required',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Plan not found',
    type: ErrorResponseDto,
  })
  async updatePlanPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanPriceDto,
  ) {
    return this.subscriptionService.updatePlanPrice(id, dto.price);
  }
}
