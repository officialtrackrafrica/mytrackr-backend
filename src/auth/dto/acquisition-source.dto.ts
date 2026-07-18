import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserAcquisitionSource } from '../entities/user.entity';

export class SubmitAcquisitionSourceDto {
  @ApiProperty({
    enum: UserAcquisitionSource,
    example: UserAcquisitionSource.INSTAGRAM,
    description: 'Where the user first found MyTrackr.',
  })
  @IsEnum(UserAcquisitionSource)
  source: UserAcquisitionSource;

  @ApiPropertyOptional({
    example: 'A friend from my business group',
    description: 'Optional free-text detail, mainly for OTHERS.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  otherDetail?: string;
}

export class AcquisitionSourceOptionDto {
  @ApiProperty({ enum: UserAcquisitionSource })
  value: UserAcquisitionSource;

  @ApiProperty({ example: 'Instagram' })
  label: string;
}

export class AcquisitionSourceStatusDto {
  @ApiProperty({ example: true })
  hasSubmittedAcquisitionSource: boolean;

  @ApiPropertyOptional({ enum: UserAcquisitionSource })
  acquisitionSource?: UserAcquisitionSource | null;

  @ApiPropertyOptional({ example: 'A friend from my business group' })
  acquisitionSourceOther?: string | null;

  @ApiPropertyOptional()
  acquisitionSourceSubmittedAt?: Date | null;
}
