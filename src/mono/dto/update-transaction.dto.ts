import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTransactionCategoryDto {
  @ApiPropertyOptional({
    description: 'Category UUID from GET /finance/categories',
    example: '350ff699-3246-45ca-ab04-77737f1464a3',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Sub-category UUID from GET /finance/categories',
    example: '70995007-fd9e-4cbe-9645-da0ddb14b4dd',
  })
  @IsOptional()
  @IsUUID()
  subCategoryId?: string;
}
