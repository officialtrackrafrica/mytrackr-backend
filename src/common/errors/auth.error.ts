export class AuthError extends Error {
  public code: string;
  public status: number;

  constructor(code: string, message: string, status: number = 401) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'AuthError';
  }
}
