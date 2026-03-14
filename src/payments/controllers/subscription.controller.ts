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
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { SubscriptionService } from '../services/subscription.service';
import { InitializeSubscriptionDto } from '../dto/subscription.dto';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get all available subscription plans' })
  @ApiResponse({ status: 200, description: 'List of active plans' })
  async getPlans() {
    return this.subscriptionService.getAllPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-plan')
  @ApiOperation({ summary: 'Get current user subscription status' })
  @ApiResponse({
    status: 200,
    description: 'Current active plan and expiration date',
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
  @ApiResponse({
    status: 200,
    description: 'The updated plan',
  })
  async updatePlanPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('price') price: number,
  ) {
    return this.subscriptionService.updatePlanPrice(id, price);
  }
}
