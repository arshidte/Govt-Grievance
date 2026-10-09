import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * RULING R12: `GET /categories` has no production seed yet (Task 16 is not
 * written), so this spec seeds its OWN fixtures in `beforeAll` — a known set
 * of categories (distinct `sortOrder`, each with subcategories) — asserts
 * against exactly that set, then deletes exactly those rows in `afterAll`
 * (narrow `deleteMany` on the ids we created; never truncate).
 */
describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = `t14-${Date.now()}`;
  const categoryIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    // Seed two categories with distinct, deliberately-out-of-insertion-order
    // sortOrder values, each with two subcategories, to prove the API both
    // orders by sortOrder and nests subcategories correctly.
    const catB = await prisma.category.create({
      data: {
        slug: `${runId}-roads`,
        name: 'Roads',
        nameMl: 'റോഡുകൾ',
        sortOrder: 20,
        subcategories: {
          create: [
            { name: 'Potholes', nameMl: 'കുഴികൾ' },
            { name: 'Streetlights', nameMl: 'തെരുവ് വിളക്കുകൾ' },
          ],
        },
      },
      include: { subcategories: true },
    });

    const catA = await prisma.category.create({
      data: {
        slug: `${runId}-water`,
        name: 'Water Supply',
        nameMl: 'ജലവിതരണം',
        sortOrder: 10,
        subcategories: {
          create: [{ name: 'Leakage', nameMl: 'ചോർച്ച' }],
        },
      },
      include: { subcategories: true },
    });

    categoryIds.push(catA.id, catB.id);
  });

  afterAll(async () => {
    await prisma.subcategory.deleteMany({ where: { categoryId: { in: categoryIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await app.close();
  });

  it('GET /categories (no auth) returns the seeded categories ordered by sortOrder, with nested subcategories', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/categories');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const seeded = response.body.filter((c: { id: string }) => categoryIds.includes(c.id));
    expect(seeded).toHaveLength(2);

    // sortOrder 10 ("Water Supply") must come before sortOrder 20 ("Roads").
    expect(seeded[0]).toMatchObject({
      slug: `${runId}-water`,
      name: 'Water Supply',
      nameMl: 'ജലവിതരണം',
    });
    expect(seeded[0].subcategories).toHaveLength(1);
    expect(seeded[0].subcategories[0]).toMatchObject({ name: 'Leakage', nameMl: 'ചോർച്ച' });
    expect(seeded[0].subcategories[0].id).toBeTypeOf('string');

    expect(seeded[1]).toMatchObject({
      slug: `${runId}-roads`,
      name: 'Roads',
      nameMl: 'റോഡുകൾ',
    });
    expect(seeded[1].subcategories).toHaveLength(2);
  });

  it('GET /panchayats without a session -> 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/panchayats');

    expect(response.status).toBe(401);
  });

  it('GET /panchayats/:id/wards without a session -> 401', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/panchayats/nonexistent-id/wards',
    );

    expect(response.status).toBe(401);
  });
});
