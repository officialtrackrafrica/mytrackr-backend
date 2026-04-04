import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationDto {
  @ApiProperty({
    description: 'Email or phone used for registration',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;
}
