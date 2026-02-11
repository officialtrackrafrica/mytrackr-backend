import {
  Controller,
  Get,
  Delete,
  Post,
  Param,
  Request,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SessionService } from '../services';
import { JwtAuthGuard } from '../guards';
import { SessionListDto } from '../dto';

import { SWAGGER_TAGS } from '../../common/docs';

interface AuthenticatedRequest {
  user: {
    sub: string;
    sessionId: string;
  };
}

@ApiTags(SWAGGER_TAGS[2].name)
@Controller('auth/sessions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SessionController {
  constructor(private sessionService: SessionService) {}

  @Get()
  @ApiOperation({ summary: 'Get all active sessions' })
  @ApiResponse({
    status: 200,
    description: 'List of active sessions',
    type: SessionListDto,
  })
  async getActiveSessions(
    @Request() req: AuthenticatedRequest,
  ): Promise<SessionListDto> {
    const userId = req.user.sub;
    const sessions = await this.sessionService.getUserSessions(userId);

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        deviceType: session.deviceInfo?.deviceType || 'Unknown',
        deviceName: session.deviceInfo?.deviceName || 'Unknown Device',
        ipAddress: session.ipAddress || 'Unknown',
        location: session.location || 'Unknown',
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
        isCurrent: session.id === req.user.sessionId,
      })),
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async revokeSession(
    @Param('id') sessionId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const userId = req.user.sub;

    // Verify user owns the session
    const session = await this.sessionService.getSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new HttpException(
        { error: 'SESSION_NOT_FOUND', message: 'Session not found' },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.sessionService.revokeSession(sessionId);

    return { success: true };
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Logout from all devices' })
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  async logoutAll(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const userId = req.user.sub;

    await this.sessionService.revokeAllUserSessions(userId);

    return { success: true };
  }
}
