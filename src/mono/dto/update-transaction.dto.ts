import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTransactionCategoryDto {
  @ApiProperty({
    description: 'The category to assign to this transaction',
    example: 'Food & Dining',
  })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({
    description: 'The sub-category to assign to this transaction',
    example: 'Restaurants',
  })
  @IsString()
  @IsOptional()
  subCategory?: string;
}
