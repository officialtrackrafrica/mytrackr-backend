import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  NotFoundException,
  Post,
  HttpException,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { User } from '../entities';
import {
  UpdateProfileDto,
  UserResponseDto,
  ChangePasswordDto,
  UploadProfilePictureDto,
} from '../dto';
import { SWAGGER_TAGS } from '../../common/docs';
import { AuthService } from '../services/auth.service';
import { AuthError } from '../../common/errors';
import { Action } from '../../casl/action.enum';
import { AppAbility } from '../../casl/casl-ability.factory';

interface AuthenticatedRequest {
  user: {
    id: string;
  };
}

const MAX_PROFILE_PICTURE_WIDTH = 800;
const MAX_PROFILE_PICTURE_HEIGHT = 400;

@ApiTags(SWAGGER_TAGS[3].name)
@Controller('users')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiCookieAuth('accessToken')
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
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Read, 'User'))
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
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Update, 'User'))
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateDto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const { firstName, lastName, country, timezone } = updateDto;
    const safeUpdate: any = {
      firstName,
      lastName,
      country,
      timezone,
    };

    Object.keys(safeUpdate).forEach((key) => {
      if (safeUpdate[key] === undefined) delete safeUpdate[key];
    });

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
  @ApiOperation({ summary: 'Change password (requires current password)' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid current password' })
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Update, 'User'))
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

  @Post('me/profile-picture')
  @ApiOperation({ summary: 'Upload profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Profile picture file (max 800x400 pixels)',
    type: UploadProfilePictureDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Profile picture uploaded returning full user profile',
    type: UserResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Update, 'User'))
  async uploadProfilePicture(
    @Request() req: AuthenticatedRequest,
    @UploadedFile() file: any,
  ): Promise<UserResponseDto> {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }

    const dimensions = this.getImageDimensions(file);
    if (!dimensions) {
      throw new HttpException(
        'Unsupported image format. Please upload a PNG, JPEG, GIF, or WebP image.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      dimensions.width > MAX_PROFILE_PICTURE_WIDTH ||
      dimensions.height > MAX_PROFILE_PICTURE_HEIGHT
    ) {
      throw new HttpException(
        `Profile picture must not exceed ${MAX_PROFILE_PICTURE_WIDTH}x${MAX_PROFILE_PICTURE_HEIGHT} pixels.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Auth service handling the file upload
    const user = await this.authService.uploadProfilePicture(req.user.id, file);
    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicture: user.profilePicture,
      country: user.country,
      timezone: user.timezone,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    };
  }

  private getImageDimensions(
    file: any,
  ): { width: number; height: number } | null {
    const buffer: Buffer | undefined = file?.buffer;
    if (!buffer || buffer.length < 10) {
      return null;
    }

    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;

      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }

        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);

        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          ![0xc4, 0xc8, 0xcc].includes(marker)
        ) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7),
          };
        }

        offset += 2 + length;
      }
    }

    if (buffer.toString('ascii', 0, 6) === 'GIF87a' ||
        buffer.toString('ascii', 0, 6) === 'GIF89a') {
      return {
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8),
      };
    }

    if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      const chunkType = buffer.toString('ascii', 12, 16);

      if (chunkType === 'VP8X') {
        return {
          width: 1 + buffer.readUIntLE(24, 3),
          height: 1 + buffer.readUIntLE(27, 3),
        };
      }

      if (chunkType === 'VP8 ') {
        return {
          width: buffer.readUInt16LE(26) & 0x3fff,
          height: buffer.readUInt16LE(28) & 0x3fff,
        };
      }

      if (chunkType === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return {
          width: (bits & 0x3fff) + 1,
          height: ((bits >> 14) & 0x3fff) + 1,
        };
      }
    }

    return null;
  }
}
