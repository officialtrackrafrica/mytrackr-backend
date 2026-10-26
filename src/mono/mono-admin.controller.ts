import { Controller, Get, Post, Param, ParseUUIDPipe, HttpCode, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PoliciesGuard } from '../casl/guards/policies.guard';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator';
import { AppAbility } from '../casl/casl-ability.factory';
import { Action } from '../casl/action.enum';
import { MonoService } from './mono.service';
import { MonoAccountResponseDto } from './dto';

@ApiTags('Admin - Mono Integration')
@Controller('admin/mono')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class MonoAdminController {
  constructor(private readonly monoService: MonoService) {}

  @Post('users/:userId/sync')
  @HttpCode(200)
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiCookieAuth('accessToken')
  @ApiOperation({
    summary: 'Test real-time transaction sync for a selected user',
    description: 'Triggers a live refresh for each linked account, bypassing the local five-minute cache. Saves downloaded transactions and imports them into finance. Returns before/after counts, latest transaction dates, and per-account completed, processing, or failed results. Mono may charge for real-time requests and enforces its own five-minute interval. For processing results, check the status endpoint after webhook completion.',
  })
  @ApiResponse({ status: 200, description: 'Before/after snapshots and per-account refresh results. Completed does not imply new transactions were found.' })
  @ApiResponse({ status: 404, description: 'No linked Mono accounts found for this user' })
  async testUserSync(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.monoService.withMonoResponses(() => this.monoService.testAdminUserSync(userId));
  }

  @Get('users/:userId/sync')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiCookieAuth('accessToken')
  @ApiOperation({
    summary: 'Inspect saved transaction sync progress for a selected user',
    description: 'Checks the saved Mono job ID using Mono\'s job-status API and returns processing, finished, or failed alongside local counts and import times. Does not initiate a bank refresh. Status-check failures are reported per account with the last known status and check time.',
  })
  @ApiResponse({ status: 200, description: 'Current saved account sync snapshot' })
  @ApiResponse({ status: 404, description: 'No linked Mono accounts found for this user' })
  async getUserSyncStatus(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.monoService.withMonoResponses(() => this.monoService.getAdminUserSyncStatus(userId));
  }

  @Get('accounts/all')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Get all Mono accounts (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'All business Mono accounts',
    type: [MonoAccountResponseDto],
  })
  async getAllPlatformAccounts() {
    return this.monoService.getAllPlatformAccounts();
  }
}
