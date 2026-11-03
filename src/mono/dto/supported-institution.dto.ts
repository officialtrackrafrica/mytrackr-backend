import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SupportedInstitutionDto {
  @ApiProperty({ description: 'Mono institution ID to submit at checkout' })
  institutionId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({
    description:
      'Supported banking category, not a savings/current product type',
    example: 'PERSONAL_BANKING',
  })
  accountType: string;

  @ApiProperty({ type: [String] })
  authMethods: string[];

  @ApiPropertyOptional()
  country?: string;

  @ApiPropertyOptional()
  bankCode?: string;

  @ApiPropertyOptional()
  icon?: string;
}
