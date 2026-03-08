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
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminUsersService } from '../services/admin-users.service';
import { AdminAuditService } from '../services/admin-audit.service';
import { UpdateUserStatusDto, AdminQueryDto } from '../dto';

@ApiTags('Admin - User Management')
@ApiBearerAuth()
@Controller('admin/users')
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

  @Get(':id/activity-log')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get user login/session activity log' })
  @ApiResponse({ status: 200, description: 'User activity log' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getActivityLog(@Param('id') userId: string) {
    return this.adminUsersService.getUserActivityLog(userId);
  }
}
