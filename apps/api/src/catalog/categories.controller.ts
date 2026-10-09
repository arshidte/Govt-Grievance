import { Controller, Get } from '@nestjs/common';
import type { CategoryDTO } from '@pg/types';

import { CategoriesService } from './categories.service';

/**
 * `GET /categories` is PUBLIC (no `AuthGuard`) — the citizen-facing issue
 * form needs the category list before a user has authenticated.
 */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async findAll(): Promise<CategoryDTO[]> {
    return this.categories.findAll();
  }
}
