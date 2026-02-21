import {
  IsString,
  MinLength,
  MaxLength,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_REGEX, PASSWORD_MESSAGE } from './email-login.dto';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password', example: 'OldPass123!' })
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  oldPassword: string;

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
