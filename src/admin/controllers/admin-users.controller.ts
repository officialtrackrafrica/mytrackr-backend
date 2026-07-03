import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminUsersService } from '../services/admin-users.service';
import { AdminAuditService } from '../services/admin-audit.service';
import {
  UpdateUserStatusDto,
  AdminQueryDto,
  AuditLogQueryDto,
  AdminUpdateUserDto,
  AdminResetUserPasswordDto,
  AdminUserSubscriptionHistoryQueryDto,
} from '../dto';

@ApiTags('Admin - User Management')
@Controller('admin/users')
@ApiCookieAuth('accessToken')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminUsersController {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({
    summary: 'List all users with search, filter, and pagination',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of users' })
  async listUsers(@Query() query: AdminQueryDto) {
    return this.adminUsersService.findAllUsers(query);
  }

  @Get('search')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Search users with the admin user list filters' })
  @ApiResponse({ status: 200, description: 'Paginated matching users' })
  async searchUsers(@Query() query: AdminQueryDto) {
    return this.adminUsersService.findAllUsers(query);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({
    summary:
      'Update user profile, email, business name, and business type as admin',
  })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id') userId: string,
    @Body() dto: AdminUpdateUserDto,
    @Req() req: any,
  ) {
    const result = await this.adminUsersService.updateUser(userId, dto);
    await this.auditService.log(
      'USER_UPDATED_BY_ADMIN',
      'User',
      userId,
      req.user.id,
      dto,
      req.ip,
    );
    return result;
  }

  @Patch(':id/status')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Update user status (activate/deactivate/suspend)' })
  @ApiResponse({ status: 200, description: 'User status updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateStatus(
    @Param('id') userId: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: any,
  ) {
    const result = await this.adminUsersService.updateUserStatus(
      userId,
      dto.status,
    );
    await this.auditService.log(
      `USER_${dto.status.toUpperCase()}`,
      'User',
      userId,
      req.user.id,
      { newStatus: dto.status },
      req.ip,
    );
    return result;
  }

  @Post(':id/reset-password')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Force password reset for a user' })
  @ApiResponse({ status: 200, description: 'Password reset initiated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async forcePasswordReset(@Param('id') userId: string, @Req() req: any) {
    const result = await this.adminUsersService.forcePasswordReset(userId);
    await this.auditService.log(
      'PASSWORD_RESET_FORCED',
      'User',
      userId,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }

  @Patch(':id/password')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Reset a user password as admin' })
  @ApiResponse({ status: 200, description: 'User password reset' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async resetUserPassword(
    @Param('id') userId: string,
    @Body() dto: AdminResetUserPasswordDto,
    @Req() req: any,
  ) {
    const result = await this.adminUsersService.resetUserPassword(userId, dto);
    await this.auditService.log(
      'PASSWORD_RESET_BY_ADMIN',
      'User',
      userId,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }

  @Delete(':id/bank-accounts/:accountId')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Disconnect a user bank account as admin' })
  @ApiResponse({ status: 200, description: 'Bank account disconnected' })
  @ApiResponse({ status: 404, description: 'User or bank account not found' })
  async disconnectBankAccount(
    @Param('id') userId: string,
    @Param('accountId') accountId: string,
    @Req() req: any,
  ) {
    const result = await this.adminUsersService.disconnectUserBankAccount(
      userId,
      accountId,
    );
    await this.auditService.log(
      'USER_BANK_ACCOUNT_DISCONNECTED',
      'User',
      userId,
      req.user.id,
      { accountId },
      req.ip,
    );
    return result;
  }

  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Soft-delete (deactivate) a user' })
  @ApiResponse({ status: 200, description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async softDelete(@Param('id') userId: string, @Req() req: any) {
    const result = await this.adminUsersService.softDeleteUser(userId);
    await this.auditService.log(
      'USER_SOFT_DELETED',
      'User',
      userId,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }

  @Post(':id/unlock')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Unlock a locked user account' })
  @ApiResponse({ status: 200, description: 'Account unlocked' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async unlockUser(@Param('id') userId: string, @Req() req: any) {
    const result = await this.adminUsersService.unlockUser(userId);
    await this.auditService.log(
      'USER_UNLOCKED',
      'User',
      userId,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }

  @Get(':id/subscription-history')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get a user subscription and billing history' })
  @ApiResponse({ status: 200, description: 'User subscription history' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getSubscriptionHistory(
    @Param('id') userId: string,
    @Query() query: AdminUserSubscriptionHistoryQueryDto,
  ) {
    return this.adminUsersService.getUserSubscriptionHistory(userId, query);
  }

  @Get(':id/activity-log')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get user login/session activity log' })
  @ApiResponse({ status: 200, description: 'User activity log' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getActivityLog(@Param('id') userId: string) {
    return this.adminUsersService.getUserActivityLog(userId);
  }

  @Get(':id/activity-logs')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get endpoint/activity logs for a user' })
  @ApiResponse({ status: 200, description: 'User activity logs' })
  async getUserActivityLogs(
    @Param('id') userId: string,
    @Query() query: AuditLogQueryDto,
  ) {
    return this.auditService.getUserActivityLogs(userId, query);
  }
}
