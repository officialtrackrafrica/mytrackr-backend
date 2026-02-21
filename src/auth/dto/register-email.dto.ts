import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_REGEX, PASSWORD_MESSAGE } from './email-login.dto';

export class RegisterWithEmailDto {
  @ApiProperty({
    description: 'Email address',
    example: 'john.doe@example.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;

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
    example: 'John',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'First name must be at most 50 characters' })
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    example: 'Doe',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Last name must be at most 50 characters' })
  lastName?: string;
}
