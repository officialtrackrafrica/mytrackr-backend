import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../guards';
import { User } from '../entities';
import { UpdateProfileDto, UserResponseDto } from '../dto';
import { SWAGGER_TAGS } from '../../common/docs';

interface AuthenticatedRequest {
  user: {
    sub: string;
  };
}

@ApiTags(SWAGGER_TAGS[3].name)
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
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
      where: { id: req.user.sub },
    });

    if (!user) {
      throw new Error('User not found');
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
    await this.usersRepository.update(req.user.sub, updateDto);

    const user = await this.usersRepository.findOne({
      where: { id: req.user.sub },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return this.sanitizeUser(user);
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
