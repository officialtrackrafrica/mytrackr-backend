import {
  IsString,
  IsOptional,
  IsUrl,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PHONE_REGEX, PHONE_MESSAGE } from './phone-login.dto';

export class UpdateProfileDto {
  @ApiProperty({ description: 'First name', example: 'John', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'First name must be at most 50 characters' })
  firstName?: string;

  @ApiProperty({ description: 'Last name', example: 'Doe', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Last name must be at most 50 characters' })
  lastName?: string;

  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+2348012345678',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;

  @ApiProperty({
    description: 'Avatar URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsUrl({}, { message: 'Avatar URL must be a valid URL' })
  @IsOptional()
  avatarUrl?: string;
}
