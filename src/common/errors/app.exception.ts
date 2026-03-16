import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export class AppException extends HttpException {
  public readonly code: string;

  constructor(
    code: ErrorCode | string,
    message: string,
    httpStatus: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super({ error: code, message }, httpStatus);
    this.code = code;
  }

  static badRequest(code: ErrorCode | string, message: string): AppException {
    return new AppException(code, message, HttpStatus.BAD_REQUEST);
  }

  static unauthorized(code: ErrorCode | string, message: string): AppException {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(code: ErrorCode | string, message: string): AppException {
    return new AppException(code, message, HttpStatus.FORBIDDEN);
  }

  static notFound(code: ErrorCode | string, message: string): AppException {
    return new AppException(code, message, HttpStatus.NOT_FOUND);
  }

  static internal(code: ErrorCode | string, message: string): AppException {
    return new AppException(code, message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
