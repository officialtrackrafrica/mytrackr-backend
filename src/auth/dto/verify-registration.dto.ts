import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyRegistrationDto {
  @ApiProperty({
    description: 'Email or phone used for registration',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  emailOrPhone: string;

  @ApiProperty({ description: 'Verification code', example: '123456' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
