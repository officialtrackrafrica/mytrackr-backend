import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from '../services/roles.service';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { AssignRoleDto } from '../dto/assign-role.dto';
import { JwtAuthGuard } from '../guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { ApiTags, ApiCookieAuth } from '@nestjs/swagger';

@ApiTags('Roles & Permissions')
@ApiCookieAuth('accessToken')
@Controller('roles')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }

  @Post('assign')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  assignRole(@Body() assignRoleDto: AssignRoleDto) {
    return this.rolesService.assignRoleToUser(
      assignRoleDto.userId,
      assignRoleDto.roleName,
    );
  }
}
