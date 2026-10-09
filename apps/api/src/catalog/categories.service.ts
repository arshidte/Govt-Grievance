import { Injectable } from '@nestjs/common';
import type { CategoryDTO } from '@pg/types';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-only access to the issue category catalog. Categories are ordered by
 * `sortOrder` (ascending); within a category, subcategories have no explicit
 * sort field in the schema, so we order them by `name` for a stable,
 * predictable listing.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<CategoryDTO[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        subcategories: {
          orderBy: { name: 'asc' },
        },
      },
    });

    return categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      nameMl: category.nameMl,
      subcategories: category.subcategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        nameMl: sub.nameMl,
      })),
    }));
  }
}
