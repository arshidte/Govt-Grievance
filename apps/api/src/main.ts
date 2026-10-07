import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: [env.CORS_ORIGIN_CITIZEN, env.CORS_ORIGIN_ADMIN],
    credentials: true,
  });

  app.use(cookieParser());

  await app.listen(env.API_PORT);
}

bootstrap();
