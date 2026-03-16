import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({
    description: 'Machine-readable error code',
    example: 'BUSINESS_NOT_FOUND',
  })
  error: string;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'Business with the provided ID was not found.',
  })
  message: string;
}

export class MessageResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Operation completed successfully',
  })
  message: string;
}
