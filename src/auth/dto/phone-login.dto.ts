import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
export const PHONE_MESSAGE =
  'Phone must be in E.164 format (e.g. +2348012345678)';

export class PhoneLoginDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+2348012345678',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone: string;

  @ApiProperty({
    description: 'Password',
    example: 'Password123!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
