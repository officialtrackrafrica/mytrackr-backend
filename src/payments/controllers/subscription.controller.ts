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
  @Post('subscribe')
  @ApiOperation({ summary: 'Initialize a new subscription payment' })
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
  async subscribe(@Req() req: any, @Body() dto: InitializeSubscriptionDto) {
    return this.subscriptionService.initializeSubscription(req.user, dto);
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
