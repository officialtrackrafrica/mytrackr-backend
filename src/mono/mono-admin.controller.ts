import { Controller, Get, UseGuards } from '@nestjs/common';
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
