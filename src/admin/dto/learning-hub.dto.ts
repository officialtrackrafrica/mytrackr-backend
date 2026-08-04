import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class LearningHubQueryDto {
  @ApiPropertyOptional({ description: 'Search title or body' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by exact category' })
  @IsOptional()
  @IsString()
  category?: string;

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

export class CreateLearningHubArticleDto {
  @ApiProperty({ example: 'How to understand cash flow' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ description: 'Article summary or educational content' })
  @IsString()
  @MinLength(1)
  body: string;

  @ApiProperty({ example: 'https://mytrackr.com/learn/cash-flow' })
  @IsString()
  @MinLength(1)
  link: string;

  @ApiProperty({ example: 'Cash Flow' })
  @IsString()
  @MinLength(1)
  category: string;
}

export class UpdateLearningHubArticleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  link?: string;

  @ApiPropertyOptional({ description: 'Assign a new category' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  category?: string;
}
