import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AuthError } from '../common/errors/auth.error';
import { DashboardSecurityService } from './dashboard-security.service';
import { errorPage } from './dashboard.view';

@Catch()
@Injectable()
export class DashboardExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DashboardExceptionFilter.name);
  constructor(private readonly security: DashboardSecurityService) {}

  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest();
    const res = host.switchToHttp().getResponse();
    if (res.headersSent) return;
    const nonce = this.security.headers(res);
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error instanceof AuthError
          ? error.status
          : 500;
    if (
      status === 401 &&
      req.method === 'GET' &&
      req.path !== '/api/dashboard/login'
    ) {
      this.security.clearTokens(res);
      res.redirect(303, '/api/dashboard/login');
      return;
    }
    let message =
      'Something went wrong. Please reload the dashboard and try again.';
    if (status < 500 && error instanceof HttpException) {
      const body = error.getResponse();
      const detail =
        typeof body === 'string'
          ? body
          : (body as { message?: string | string[] }).message;
      message = Array.isArray(detail)
        ? detail.join(' ')
        : detail || 'Unable to complete this request.';
    }
    if (error instanceof AuthError)
      message =
        'Unable to sign in. Check your credentials, account verification, and account status.';
    if (status >= 500)
      this.logger.error(
        `Dashboard request failed (${req.method} ${req.route?.path || 'unknown'}).`,
      );
    if (status === 429) res.setHeader('Retry-After', '60');
    res
      .status(status)
      .type('html')
      .send(errorPage(status, message, nonce));
  }
}
