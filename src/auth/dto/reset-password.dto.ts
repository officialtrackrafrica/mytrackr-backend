import {
  IsEmail,
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_REGEX, PASSWORD_MESSAGE } from './email-login.dto';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Email address that requested the password reset OTP',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    description: '6-digit password reset OTP received via email',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reset OTP is required' })
  @MinLength(6)
  @MaxLength(6)
  token: string;

  @ApiProperty({
    description:
      'New password (min 8 chars, must include uppercase, lowercase, number, and special character)',
    example: 'NewPass123!',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(8)
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword: string;
}
