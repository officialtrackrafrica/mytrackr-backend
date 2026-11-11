import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth/services/auth.service';
import { DashboardSecurityService } from './dashboard-security.service';

@Injectable()
export class DashboardAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly auth: AuthService,
    private readonly security: DashboardSecurityService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    this.security.headers(res);
    req.cookies = {
      ...req.cookies,
      accessToken: req.cookies?.[this.security.accessCookieName()] || '',
    };
    // Dashboard sessions are independent of the main application's cookies/bearer tokens.
    delete req.headers.authorization;
    try {
      await super.canActivate(context);
    } catch (error) {
      if (
        !(error instanceof UnauthorizedException) ||
        !req.cookies[this.security.refreshCookieName()]
      )
        throw error;
      try {
        const tokens = await this.auth.refreshToken({
          refreshToken: req.cookies[this.security.refreshCookieName()],
        });
        if (!tokens.accessToken || !tokens.refreshToken)
          throw new UnauthorizedException();
        this.security.setTokens(res, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
        req.cookies.accessToken = tokens.accessToken;
        await super.canActivate(context);
      } catch {
        this.security.clearTokens(res);
        throw new UnauthorizedException(
          'Your session has expired. Please sign in again.',
        );
      }
    }
    if (
      !req.user?.isVerified ||
      !(await this.security.hasSession(req.user.sessionId, req.user.id))
    ) {
      throw new UnauthorizedException(
        'Please sign in to the developer dashboard.',
      );
    }
    return true;
  }
}
