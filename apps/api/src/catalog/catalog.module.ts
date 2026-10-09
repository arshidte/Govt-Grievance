import { Module } from '@nestjs/common';

import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

/**
 * Owns the read-only issue category catalog (`GET /categories`, public).
 * `PrismaService` comes from the global `PrismaModule`.
 */
@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CatalogModule {}
