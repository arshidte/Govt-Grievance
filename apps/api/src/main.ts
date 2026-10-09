import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { env } from './config/env';

/** Request body size cap, applied to both JSON and urlencoded parsers below. */
const BODY_SIZE_LIMIT = '1mb';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.useGlobalFilters(new AllExceptionsFilter());

  // HTTP-edge security headers (CSP, X-Content-Type-Options, HSTS, etc.).
  // Applied before CORS is configured below; helmet does not set or strip
  // any CORS-related header itself, so `enableCors` remains the single
  // source of truth for Access-Control-* headers on both frontends.
  app.use(helmet());

  app.enableCors({
    origin: [env.CORS_ORIGIN_CITIZEN, env.CORS_ORIGIN_ADMIN],
    credentials: true,
  });

  app.use(cookieParser());

  // Cap request body size so an oversized payload is rejected (413) before
  // it reaches route handlers/validation pipes.
  app.use(express.json({ limit: BODY_SIZE_LIMIT }));
  app.use(express.urlencoded({ limit: BODY_SIZE_LIMIT, extended: true }));

  await app.listen(env.API_PORT);
}

bootstrap();
