import { ApiProperty } from '@nestjs/swagger';

export class SessionDto {
  @ApiProperty({ description: 'Session ID', example: 'sess-123' })
  id: string;

  @ApiProperty({ description: 'Device type', example: 'mobile' })
  deviceType: string;

  @ApiProperty({ description: 'Device name', example: 'iPhone 13' })
  deviceName: string;

  @ApiProperty({ description: 'IP address', example: '127.0.0.1' })
  ipAddress: string;

  @ApiProperty({ description: 'Location', example: 'New York, US' })
  location: string;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last active date' })
  lastActiveAt: Date;

  @ApiProperty({ description: 'Is current session', example: true })
  isCurrent: boolean;
}

export class SessionListDto {
  @ApiProperty({ type: [SessionDto] })
  sessions: SessionDto[];
}
