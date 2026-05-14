import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { AdminAuditService } from '../../admin/services/admin-audit.service';

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityLogInterceptor.name);
  private static readonly EXCLUDED_ROUTE_PATTERNS = [
    /^\/favicon\.ico$/i,
    /^\/health(?:\/.*)?$/i,
  ];
  private static readonly MUTATING_METHODS = new Set([
    'POST',
    'PATCH',
    'PUT',
    'DELETE',
  ]);
  private static readonly INCLUDED_GET_ROUTE_PATTERNS = [
    /^\/finance\/assets$/i,
    /^\/finance\/liabilities$/i,
  ];
  private static readonly REDACTED_KEYS = new Set([
    'password',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'token',
    'accessToken',
    'refreshToken',
    'otp',
    'code',
    'secret',
  ]);

  constructor(private readonly auditService: AdminAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();
    const requestPath = request.originalUrl || request.url || request.path || '';
    if (this.shouldSkipLogging(requestPath)) {
      return next.handle();
    }

    const normalizedMethod = String(request.method || '').toUpperCase();
    const resource = this.getResourceName(request);
    if (
      !ActivityLogInterceptor.MUTATING_METHODS.has(normalizedMethod) &&
      !this.shouldLogReadRequest(normalizedMethod, resource)
    ) {
      return next.handle();
    }

    const startedAt = Date.now();
    const action = `HTTP_${normalizedMethod || 'UNKNOWN'}`;
    const resourceId = this.extractResourceId(request.params);
    const userId = request.user?.id || null;
    const ipAddress =
      request.ip ||
      request.headers?.['x-forwarded-for'] ||
      request.socket?.remoteAddress ||
      null;
    const userAgent = request.headers?.['user-agent'] || null;
    const baseDetails = {
      route: resource,
      originalUrl: request.originalUrl || null,
      method: request.method || null,
      controller: context.getClass().name,
      handler: context.getHandler().name,
      params: this.sanitizeValue(request.params),
      query: this.sanitizeValue(request.query),
      body: this.sanitizeValue(request.body),
      resourceId,
    };

    return next.handle().pipe(
      mergeMap((data) =>
        from(
          this.safeLog(
            action,
            resource,
            resourceId,
            userId,
            {
              ...baseDetails,
              outcome: 'success',
              statusCode: response.statusCode,
              durationMs: Date.now() - startedAt,
              displayAction: this.buildDisplayAction(
                request.method,
                resource,
                context.getHandler().name,
                resourceId,
                false,
              ),
              successMessage: this.buildSuccessMessage(
                request.method,
                resource,
                context.getHandler().name,
                resourceId,
                data,
              ),
            },
            ipAddress,
            userAgent,
          ),
        ).pipe(mergeMap(() => from(Promise.resolve(data)))),
      ),
      catchError((error) =>
        from(
          this.safeLog(
            `${action}_ERROR`,
            resource,
            resourceId,
            userId,
            {
              ...baseDetails,
              outcome: 'error',
              statusCode: error?.status || response.statusCode || 500,
              durationMs: Date.now() - startedAt,
              displayAction: this.buildDisplayAction(
                request.method,
                resource,
                context.getHandler().name,
                resourceId,
                true,
              ),
              errorMessage: error?.message || 'Unknown error',
            },
            ipAddress,
            userAgent,
          ),
        ).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }

  private getResourceName(request: any): string {
    const baseUrl = request.baseUrl || '';
    const routePath = request.route?.path || '';
    const combined = `${baseUrl}${routePath}`.trim();
    return combined || request.path || request.originalUrl || 'unknown';
  }

  private shouldSkipLogging(path: string): boolean {
    return ActivityLogInterceptor.EXCLUDED_ROUTE_PATTERNS.some((pattern) =>
      pattern.test(path),
    );
  }

  private shouldLogReadRequest(method: string, resource: string): boolean {
    if (method !== 'GET') {
      return false;
    }

    return ActivityLogInterceptor.INCLUDED_GET_ROUTE_PATTERNS.some((pattern) =>
      pattern.test(resource),
    );
  }

  private buildDisplayAction(
    method: string,
    resource: string,
    handler: string,
    resourceId: string | null,
    isError: boolean,
  ): string {
    const mapped = this.matchFriendlyLabel(resource, handler, method);
    if (mapped) {
      const withId = this.appendResourceId(mapped, resourceId);
      return isError ? `${withId} failed` : withId;
    }

    const normalizedMethod = String(method || 'REQUEST').toUpperCase();
    const generic = this.humanizeResource(resource);

    switch (normalizedMethod) {
      case 'GET':
        return isError ? `Failed to view ${generic}` : `Viewed ${generic}`;
      case 'POST':
        return this.appendResourceId(
          isError ? `Failed to create ${generic}` : `Created ${generic}`,
          resourceId,
        );
      case 'PATCH':
        return this.appendResourceId(
          isError ? `Failed to update ${generic}` : `Updated ${generic}`,
          resourceId,
        );
      case 'DELETE':
        return this.appendResourceId(
          isError ? `Failed to delete ${generic}` : `Deleted ${generic}`,
          resourceId,
        );
      default:
        return this.appendResourceId(
          isError ? `Failed request to ${generic}` : `Request to ${generic}`,
          resourceId,
        );
    }
  }

  private buildSuccessMessage(
    method: string,
    resource: string,
    handler: string,
    resourceId: string | null,
    data: any,
  ): string {
    const explicitMessage = this.extractResponseMessage(data);
    if (explicitMessage) {
      return explicitMessage;
    }

    const mapped = this.matchFriendlyLabel(resource, handler, method);
    if (mapped) {
      return this.appendResourceId(mapped, resourceId);
    }

    const normalizedMethod = String(method || 'REQUEST').toUpperCase();
    const generic = this.humanizeResource(resource);

    switch (normalizedMethod) {
      case 'GET':
        return `Fetched ${generic}`;
      case 'POST':
        return this.appendResourceId(`Created ${generic}`, resourceId);
      case 'PATCH':
        return this.appendResourceId(`Updated ${generic}`, resourceId);
      case 'DELETE':
        return this.appendResourceId(`Deleted ${generic}`, resourceId);
      default:
        return this.appendResourceId(`Completed request for ${generic}`, resourceId);
    }
  }

  private extractResponseMessage(data: any): string | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }

    if (typeof data.title === 'string' && data.title.trim()) {
      return data.title.trim();
    }

    return null;
  }

  private matchFriendlyLabel(
    resource: string,
    handler: string,
    method: string,
  ): string | null {
    const route = resource.toLowerCase();
    const action = handler.toLowerCase();
    const normalizedMethod = String(method || '').toUpperCase();

    const routeMatchers: Array<[RegExp, string]> = [
      [/^\/finance\/transactions\/upload-pdf$/i, 'Uploaded PDF statement transactions'],
      [/^\/finance\/transactions\/upload-csv$/i, 'Uploaded CSV statement transactions'],
      [/^\/finance\/transactions\/summary$/i, 'Viewed transaction summary'],
      [/^\/finance\/transactions\/:id$/i, normalizedMethod === 'PATCH' ? 'Updated transaction' : 'Deleted transaction'],
      [/^\/finance\/transactions$/i, normalizedMethod === 'POST' ? 'Created manual transaction' : 'Viewed transactions'],
      [/^\/finance\/linked-accounts\/transactions$/i, 'Viewed linked-account transactions'],
      [/^\/finance\/linked-accounts\/transactions\/:id\/category$/i, normalizedMethod === 'PATCH' ? 'Updated transaction category' : 'Reset transaction category'],
      [/^\/reports\/analytics$/i, 'Viewed analytics report'],
      [/^\/reports\/pnl$/i, 'Viewed profit and loss report'],
      [/^\/reports\/cash-flow$/i, 'Viewed cash flow report'],
      [/^\/reports\/balance-sheet$/i, 'Viewed balance sheet'],
      [/^\/users\/me$/i, normalizedMethod === 'GET' ? 'Viewed profile' : 'Updated profile'],
      [/^\/users\/change-password$/i, 'Changed password'],
      [/^\/users\/me\/profile-picture$/i, 'Uploaded profile picture'],
      [/^\/users\/me\/activity-logs$/i, 'Viewed activity logs'],
      [/^\/auth\/login\/email$/i, 'Logged in with email'],
      [/^\/auth\/register\/email$/i, 'Registered account'],
      [/^\/auth\/verify-otp$/i, 'Verified account'],
      [/^\/auth\/forgot-password$/i, 'Requested password reset'],
      [/^\/auth\/reset-password$/i, 'Reset password'],
      [/^\/auth\/logout$/i, 'Logged out'],
      [/^\/auth\/refresh$/i, 'Refreshed session'],
      [/^\/admin\/audit-logs$/i, 'Viewed audit logs'],
      [/^\/admin\/audit-logs\/export$/i, 'Exported audit logs'],
      [/^\/admin\/audit-logs\/cleanup$/i, 'Cleaned up audit logs'],
      [/^\/admin\/users\/:id\/activity-logs$/i, 'Viewed user activity logs'],
    ];

    for (const [pattern, label] of routeMatchers) {
      if (pattern.test(route)) {
        return label;
      }
    }

    const handlerMatchers: Array<[RegExp, string]> = [
      [/uploadpdf/i, 'Uploaded PDF statement transactions'],
      [/uploadcsv/i, 'Uploaded CSV statement transactions'],
      [/createtransaction/i, 'Created manual transaction'],
      [/updatetransaction/i, 'Updated transaction'],
      [/deletetransaction/i, 'Deleted transaction'],
      [/getanalytics/i, 'Viewed analytics report'],
      [/getpnl/i, 'Viewed profit and loss report'],
      [/getcashflow/i, 'Viewed cash flow report'],
      [/getbalancesheet/i, 'Viewed balance sheet'],
      [/getmyactivitylogs/i, 'Viewed activity logs'],
    ];

    for (const [pattern, label] of handlerMatchers) {
      if (pattern.test(action)) {
        return label;
      }
    }

    return null;
  }

  private humanizeResource(resource: string): string {
    return resource
      .replace(/^\/+/, '')
      .replace(/\/:id/g, '')
      .replace(/\//g, ' ')
      .replace(/-/g, ' ')
      .trim() || 'resource';
  }

  private extractResourceId(params: Record<string, any> | undefined): string | null {
    if (!params || typeof params !== 'object') {
      return null;
    }

    const preferredKeys = ['id', 'transactionId', 'userId', 'accountId', 'key'];
    for (const key of preferredKeys) {
      const value = params[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    for (const value of Object.values(params)) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private appendResourceId(message: string, resourceId: string | null): string {
    if (!resourceId) {
      return message;
    }

    return `${message} (${resourceId})`;
  }

  private async safeLog(
    action: string,
    resource: string,
    resourceId: string | null,
    userId: string | null,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      await this.auditService.log(
        action,
        resource,
        resourceId,
        userId,
        details,
        ipAddress || undefined,
        userAgent || undefined,
      );
    } catch (error: any) {
      this.logger.error(`Failed to persist activity log: ${error.message}`);
    }
  }

  private sanitizeValue(value: any, depth = 0): any {
    if (value == null) {
      return value;
    }

    if (depth > 3) {
      return '[Truncated]';
    }

    if (typeof value === 'string') {
      return value.length > 500 ? `${value.slice(0, 500)}...[truncated]` : value;
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => this.sanitizeValue(item, depth + 1));
    }

    const output: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      if (ActivityLogInterceptor.REDACTED_KEYS.has(key)) {
        output[key] = '[REDACTED]';
        continue;
      }

      if (Buffer.isBuffer(item)) {
        output[key] = `[Buffer ${item.length} bytes]`;
        continue;
      }

      output[key] = this.sanitizeValue(item, depth + 1);
    }

    return output;
  }
}
