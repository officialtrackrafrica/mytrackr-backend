import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTransactionCategoryDto {
  @ApiProperty({
    description: 'The category to assign to this transaction',
    example: 'Food & Dining',
  })
  @IsString()
  @IsNotEmpty()
  category: string;
}
