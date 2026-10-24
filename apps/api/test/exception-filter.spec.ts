import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiError } from '../src/common/api-error';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';

@Controller('test-errors')
class TestErrorsController {
  @Get('unknown')
  throwUnknown(): never {
    throw new Error('something exploded with a secret stack trace');
  }

  @Get('api-error')
  throwApiError(): never {
    throw new ApiError('rate_limited', 429, 'auth.tooMany');
  }

  @Get('http-exception')
  throwHttpException(): never {
    throw new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);
  }

  /**
   * Simulates what `@nestjs/platform-express`'s Multer interceptor actually
   * throws for an oversize upload (Task 16): it internally converts the raw
   * `MulterError('LIMIT_FILE_SIZE')` into this standard Nest exception
   * BEFORE the filter ever sees it (see `multer.utils.js`'s
   * `transformException`) — so this is the realistic input to the filter's
   * new branch, not a raw `MulterError`.
   */
  @Get('payload-too-large')
  throwPayloadTooLarge(): never {
    throw new PayloadTooLargeException('File too large');
  }
}

describe('AllExceptionsFilter (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestErrorsController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('maps an unknown Error to 500 with a generic body and no stack/internal message', async () => {
    const response = await request(app.getHttpServer()).get('/test-errors/unknown');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'internal', messageKey: 'states.error' } });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('something exploded');
    expect(serialized.toLowerCase()).not.toContain('stack');
  });

  it('maps ApiError to its own status and messageKey', async () => {
    const response = await request(app.getHttpServer()).get('/test-errors/api-error');

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      error: { code: 'rate_limited', messageKey: 'auth.tooMany' },
    });
  });

  it('maps a Nest HttpException to its status and a { error: { code, messageKey } } shape', async () => {
    const response = await request(app.getHttpServer()).get('/test-errors/http-exception');

    expect(response.status).toBe(403);
    expect(response.body.error).toBeDefined();
    expect(typeof response.body.error.code).toBe('string');
    expect(typeof response.body.error.messageKey).toBe('string');
  });

  it('maps Multer\'s oversize rejection (PayloadTooLargeException) to 413 file_too_large, matching the service\'s own 413 (Task 16, additive branch)', async () => {
    const response = await request(app.getHttpServer()).get('/test-errors/payload-too-large');

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: { code: 'file_too_large', messageKey: 'errors.fileTooLarge' },
    });
  });
});
