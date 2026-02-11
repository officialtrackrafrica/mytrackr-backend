import {
  IsString,
  IsOptional,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeviceInfoDto } from './unified-login.dto';

export class WebAuthnRegisterVerifyDto {
  @IsObject()
  credential: Record<string, unknown>;
}

export class WebAuthnLoginOptionsDto {
  @IsString()
  identifier: string;
}

export class WebAuthnLoginVerifyDto {
  @IsString()
  identifier: string;

  @IsObject()
  credential: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}
