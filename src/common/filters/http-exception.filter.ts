import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AuthError } from '../errors/auth.error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // In certain situations `httpAdapter` might not be available in the
    // constructor method, thus we should resolve it here.
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : this.getHttpStatus(exception);

    const responseBody = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
      message:
        exception instanceof HttpException
          ? exception.message
          : this.getErrorMessage(exception),
    };

    if (httpStatus === (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
      this.logger.error(
        `Exception: ${JSON.stringify(responseBody)}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`Exception: ${JSON.stringify(responseBody)}`);
    }

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }

  private getHttpStatus(exception: unknown): number {
    if (exception instanceof AuthError) {
      return exception.status;
    }
    if ((exception as any).code === '23505') {
      return HttpStatus.CONFLICT;
    }
    if ((exception as any).name === 'EntityNotFoundError') {
      return HttpStatus.NOT_FOUND;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getErrorMessage(exception: unknown): string {
    if (exception instanceof AuthError) {
      return exception.message;
    }
    if ((exception as any).code === '23505') {
      return 'Unique constraint violation';
    }
    if ((exception as any).name === 'EntityNotFoundError') {
      return 'Entity not found';
    }
    return 'Internal server error';
  }
}
