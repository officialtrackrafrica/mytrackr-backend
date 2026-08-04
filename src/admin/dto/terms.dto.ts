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

export class TermsHistoryQueryDto {
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

export class CreateTermsDto {
  @ApiProperty({ example: 'MyTrackr Terms and Conditions' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({
    description: 'Terms content in HTML, Markdown, or plain text',
  })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiPropertyOptional({
    description:
      'When this version becomes effective. Can also be set while publishing.',
    example: '2026-08-10T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}

export class UpdateTermsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({
    description: 'Terms content in HTML, Markdown, or plain text',
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

export class PublishTermsDto {
  @ApiPropertyOptional({
    description: 'Defaults to the draft effective date or the current time',
    example: '2026-08-10T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
