import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class PrivacyPolicyHistoryQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'published'] })
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class CreatePrivacyPolicyDto {
  @ApiProperty({ example: 'MyTrackr Privacy Policy' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({
    description: 'Policy content in HTML, Markdown, or plain text',
  })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiPropertyOptional({ example: '2026-08-10T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}

export class UpdatePrivacyPolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({
    description: 'Policy content in HTML, Markdown, or plain text',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @ApiPropertyOptional({ example: '2026-08-10T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}

export class PublishPrivacyPolicyDto {
  @ApiPropertyOptional({
    description: 'Defaults to the draft effective date or the current time',
    example: '2026-08-10T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
