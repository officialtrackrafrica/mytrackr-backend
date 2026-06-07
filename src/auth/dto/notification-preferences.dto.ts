import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class NotificationChannelPreferencesDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  email: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  push: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  sms: boolean;
}

export class NotificationPreferencesDto {
  @ApiProperty({ type: NotificationChannelPreferencesDto })
  @ValidateNested()
  @Type(() => NotificationChannelPreferencesDto)
  appUpdates: NotificationChannelPreferencesDto;

  @ApiProperty({ type: NotificationChannelPreferencesDto })
  @ValidateNested()
  @Type(() => NotificationChannelPreferencesDto)
  reminders: NotificationChannelPreferencesDto;

  @ApiProperty({ type: NotificationChannelPreferencesDto })
  @ValidateNested()
  @Type(() => NotificationChannelPreferencesDto)
  userActivities: NotificationChannelPreferencesDto;
}

export class UpdateNotificationChannelPreferencesDto {
  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  email?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  push?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  sms?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ type: UpdateNotificationChannelPreferencesDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateNotificationChannelPreferencesDto)
  appUpdates?: UpdateNotificationChannelPreferencesDto;

  @ApiPropertyOptional({ type: UpdateNotificationChannelPreferencesDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateNotificationChannelPreferencesDto)
  reminders?: UpdateNotificationChannelPreferencesDto;

  @ApiPropertyOptional({ type: UpdateNotificationChannelPreferencesDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateNotificationChannelPreferencesDto)
  userActivities?: UpdateNotificationChannelPreferencesDto;
}
