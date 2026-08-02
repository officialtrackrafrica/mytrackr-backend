import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { User } from '../entities';
import { RolesService } from '../services/roles.service';
import { EncryptionService } from '../../security/encryption.service';
import { CreateStaffDto } from '../dto/create-staff.dto';
import { AssignRoleDto } from '../dto/assign-role.dto';

@ApiTags('Admin')
@ApiCookieAuth('accessToken')
@Controller('admin')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminController {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly rolesService: RolesService,
    private readonly encryptionService: EncryptionService,
  ) {}

  @Post('staff')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Create a new staff member (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Staff member created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async createStaff(@Body() createStaffDto: CreateStaffDto) {
    const { email, firstName, lastName, password, roleName } = createStaffDto;

    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) {
      throw new NotFoundException('User with this email already exists');
    }

    const passwordHash = await this.encryptionService.hashPassword(password);
    const staffUser = this.usersRepository.create({
      email,
      firstName,
      lastName,
      passwordHash,
      isVerified: true,
      isActive: true,
      securitySettings: { mfaEnabled: false },
    });
    const savedUser = await this.usersRepository.save(staffUser);

    const assignedRole = roleName || 'Staff';
    await this.rolesService.assignRoleToUser(savedUser.id, assignedRole);

    const userWithRoles = await this.usersRepository.findOne({
      where: { id: savedUser.id },
      relations: ['roles'],
    });

    return {
      id: userWithRoles!.id,
      email: userWithRoles!.email,
      firstName: userWithRoles!.firstName,
      lastName: userWithRoles!.lastName,
      roles: userWithRoles!.roles.map((r) => r.name),
      isActive: userWithRoles!.isActive,
      createdAt: userWithRoles!.createdAt,
    };
  }

  @Patch('users/:id/roles')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Assign a role to a user (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Role assigned' })
  @ApiResponse({ status: 404, description: 'User or role not found' })
  async assignRole(@Param('id') userId: string, @Body() body: AssignRoleDto) {
    const user = await this.rolesService.assignRoleToUser(
      userId,
      body.roleName,
    );
    const userWithRoles = await this.usersRepository.findOne({
      where: { id: user.id },
      relations: ['roles'],
    });

    return {
      id: userWithRoles!.id,
      email: userWithRoles!.email,
      roles: userWithRoles!.roles.map((r) => r.name),
    };
  }

  @Delete('users/:id/roles/:roleName')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Remove a role from a user (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Role removed' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async removeRole(
    @Param('id') userId: string,
    @Param('roleName') roleName: string,
  ) {
    const user = await this.rolesService.removeRoleFromUser(userId, roleName);
    const userWithRoles = await this.usersRepository.findOne({
      where: { id: user.id },
      relations: ['roles'],
    });

    return {
      id: userWithRoles!.id,
      email: userWithRoles!.email,
      roles: userWithRoles!.roles.map((r) => r.name),
    };
  }
}
