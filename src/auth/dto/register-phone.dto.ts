import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_REGEX, PASSWORD_MESSAGE } from './email-login.dto';
import { PHONE_REGEX, PHONE_MESSAGE } from './phone-login.dto';

export class RegisterWithPhoneDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+2348012345678',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone: string;

  @ApiProperty({
    description:
      'Password (min 8 chars, must include uppercase, lowercase, number, and special character)',
    example: 'MySecurePass123!',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiPropertyOptional({
    description: 'First name',
    example: 'Jane',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'First name must be at most 50 characters' })
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    example: 'Smith',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Last name must be at most 50 characters' })
  lastName?: string;
}
