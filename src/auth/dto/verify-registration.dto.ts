import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyRegistrationDto {
  @ApiProperty({
    description: 'Email or phone used for registration',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty({ message: 'Email or phone is required' })
  emailOrPhone: string;

  @ApiProperty({ description: '6-digit verification code', example: '123456' })
  @IsString()
  @IsNotEmpty({ message: 'Verification code is required' })
  @Length(6, 6, { message: 'Verification code must be exactly 6 digits' })
  code: string;
}
