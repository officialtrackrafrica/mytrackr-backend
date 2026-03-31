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
    description: 'Professional Title',
    example: 'Product Designer',
    required: false,
  })
  @IsString()
  @IsOptional()
  professionalTitle?: string;

  @ApiProperty({
    description: 'Country',
    example: 'Australia',
    required: false,
  })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({
    description: 'Timezone',
    example: 'UTC-08:00',
    required: false,
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiProperty({
    description: 'Biography',
    example: 'I am a Product Designer...',
    required: false,
  })
  @IsString()
  @IsOptional()
  bio?: string;
}
