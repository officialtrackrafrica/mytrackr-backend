import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  NotFoundException,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { User } from '../entities';
import { UpdateProfileDto, UserResponseDto, ChangePasswordDto } from '../dto';
import { SWAGGER_TAGS } from '../../common/docs';
import { AuthService } from '../services/auth.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthError } from '../../common/errors';

interface AuthenticatedRequest {
  user: {
    id: string;
  };
}

@ApiTags(SWAGGER_TAGS[3].name)
@Controller('users')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class UserController {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private authService: AuthService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile',
    type: UserResponseDto,
  })
  async getProfile(
    @Request() req: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id: req.user.id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated',
    type: UserResponseDto,
  })
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateDto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    // Explicitly strip sensitive fields that must not be updated via this endpoint
    const { firstName, lastName, phone, avatarUrl } = updateDto;
    const safeUpdate = { firstName, lastName, phone, avatarUrl };

    // Remove undefined values so we don't overwrite with null
    Object.keys(safeUpdate).forEach(
      (key) =>
        safeUpdate[key as keyof typeof safeUpdate] === undefined &&
        delete safeUpdate[key as keyof typeof safeUpdate],
    );

    await this.usersRepository.update(req.user.id, safeUpdate);

    const user = await this.usersRepository.findOne({
      where: { id: req.user.id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid current password' })
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    try {
      return await this.authService.changePassword(req.user.id, dto);
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'PASSWORD_CHANGE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private sanitizeUser(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    };
  }
}
