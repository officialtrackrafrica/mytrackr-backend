import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EnableMfaResponseDto {
  @ApiProperty({
    description: 'TOTP secret (for manual entry)',
    example: 'JBSWY3DPEHPK3PXP',
  })
  secret: string;

  @ApiProperty({
    description: 'otpauth:// URI for authenticator apps',
    example:
      'otpauth://totp/MyTrackr:john@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyTrackr',
  })
  otpauthUrl: string;

  @ApiProperty({
    description:
      'QR code as a base64 data URL (scan with Google Authenticator)',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUh...',
  })
  qrCodeDataUrl: string;
}

export class VerifyMfaSetupDto {
  @ApiProperty({
    description: '6-digit TOTP code from Google Authenticator',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  token: string;
}

export class MfaEnabledResponseDto {
  @ApiProperty({ example: true })
  mfaEnabled: boolean;

  @ApiProperty({
    description: 'Backup codes for account recovery (store securely)',
    example: [
      'A1B2C3D4',
      'E5F6G7H8',
      'I9J0K1L2',
      'M3N4O5P6',
      'Q7R8S9T0',
      'U1V2W3X4',
      'Y5Z6A7B8',
      'C9D0E1F2',
      'G3H4I5J6',
      'K7L8M9N0',
    ],
  })
  backupCodes: string[];
}

export class DisableMfaDto {
  @ApiProperty({
    description: '6-digit TOTP code to confirm identity',
    example: '654321',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  token: string;

  @ApiProperty({
    description: 'Current account password for extra verification',
    example: 'MySecurePass123!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class DisableMfaResponseDto {
  @ApiProperty({ example: false })
  mfaEnabled: boolean;

  @ApiProperty({ example: 'Two-factor authentication has been disabled' })
  message: string;
}

export class RegenerateBackupCodesDto {
  @ApiProperty({
    description: '6-digit TOTP code to confirm identity',
    example: '456789',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  token: string;
}

export class BackupCodesResponseDto {
  @ApiProperty({
    description: 'New backup codes (previous codes are invalidated)',
    example: [
      'X1Y2Z3A4',
      'B5C6D7E8',
      'F9G0H1I2',
      'J3K4L5M6',
      'N7O8P9Q0',
      'R1S2T3U4',
      'V5W6X7Y8',
      'Z9A0B1C2',
      'D3E4F5G6',
      'H7I8J9K0',
    ],
  })
  backupCodes: string[];
}
