import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_REGEX, PASSWORD_MESSAGE } from './email-login.dto';

export class CreateStaffDto {
  @ApiProperty({
    description: 'Staff email address',
    example: 'staff@mytrackr.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Staff first name',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50, { message: 'First name must be at most 50 characters' })
  firstName: string;

  @ApiProperty({
    description: 'Staff last name',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50, { message: 'Last name must be at most 50 characters' })
  lastName: string;

  @ApiProperty({
    description:
      'Staff password (min 8 chars, must include uppercase, lowercase, number, and special character)',
    example: 'StaffPassword123!',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiPropertyOptional({
    description: 'Role to assign (defaults to "Staff")',
    example: 'Staff',
    enum: ['Staff', 'Admin'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['Staff', 'Admin'], {
    message: 'Role must be either Staff or Admin',
  })
  roleName?: string;
}
