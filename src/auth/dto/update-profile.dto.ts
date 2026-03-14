import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
    description: 'Business name',
    example: 'Acme Corp',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Business name must be at most 100 characters' })
  businessName?: string;
}
