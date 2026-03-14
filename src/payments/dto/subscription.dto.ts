import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitializeSubscriptionDto {
  @ApiProperty({ description: 'The ID of the plan to subscribe to' })
  @IsString()
  @IsNotEmpty()
  planId: string;
}
