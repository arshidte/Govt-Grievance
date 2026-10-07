import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

import { ApiError } from './api-error';

interface ApiErrorBody {
  error: { code: string; messageKey: string };
}

/**
 * Global safety net for all uncaught exceptions.
 *
 * - `ApiError` -> its own `status` and `{ error: { code, messageKey } }`.
 * - Nest `HttpException` -> its own status and a normalized
 *   `{ error: { code, messageKey } }` body (code derived from the status
 *   name; messageKey falls back to a generic key since HttpException
 *   messages are not guaranteed to be translation keys).
 * - Anything else (unknown `Error`, non-Error throw, etc.) -> HTTP 500 with
 *   a fixed generic body. The full error (including stack) is logged
 *   server-side via Nest's Logger and NEVER included in the response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof ApiError) {
      this.logger.warn(`ApiError: ${exception.code} (${exception.status}) ${exception.message}`);
      response.status(exception.status).json(this.body(exception.code, exception.messageKey));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const { code, messageKey } = this.fromHttpException(exception, status);
      this.logger.warn(`HttpException: ${status} ${exception.message}`);
      response.status(status).json(this.body(code, messageKey));
      return;
    }

    // Unknown/unexpected error: log full detail server-side only, never leak
    // it to the client.
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(this.body('internal', 'states.error'));
  }

  private fromHttpException(
    exception: HttpException,
    status: number,
  ): { code: string; messageKey: string } {
    const response = exception.getResponse();

    if (
      typeof response === 'object' &&
      response !== null &&
      'error' in response &&
      typeof (response as { error?: unknown }).error === 'object'
    ) {
      const err = (response as { error: { code?: unknown; messageKey?: unknown } }).error;
      if (typeof err.code === 'string' && typeof err.messageKey === 'string') {
        return { code: err.code, messageKey: err.messageKey };
      }
    }

    return { code: HttpStatus[status]?.toLowerCase() ?? 'http_error', messageKey: 'states.error' };
  }

  private body(code: string, messageKey: string): ApiErrorBody {
    return { error: { code, messageKey } };
  }
}
