import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { AuthError } from '../errors/auth.error';

@Catch(AuthError)
export class AuthErrorFilter implements ExceptionFilter {
  catch(exception: AuthError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(exception.status).json({
      error: exception.code,
      message: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
}
