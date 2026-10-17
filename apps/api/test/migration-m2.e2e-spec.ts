/**
 * Task 3 — migration-safety test for `m2_issue_lifecycle` against a
 * POPULATED pre-M2 database (spec §4.5).
 *
 * A real M1 production DB has an EMPTY `IssueStatusHistory` table (M1
 * shipped no issue-creation path), so this scenario never happens in
 * practice on the real deployment history — but the migration must still
 * be safe for any populated table, and this is the test that proves it.
 *
 * Strategy: build a throwaway Postgres database from scratch, apply the
 * two existing M1 migration.sql files directly (putting it at the exact
 * pre-M2 shape, including the legacy `IssueStatusHistory.status String`
 * column), insert legacy-shaped rows via raw SQL, then apply the new M2
 * migration.sql and assert the backfill is lossless and non-fabricating.
 */
import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MigrationTestDb } from './helpers/migration-db';

describe('m2_issue_lifecycle migration — populated legacy-data safety', () => {
  // A FRESH throwaway database per test (not per suite) — each test needs
  // its own clean M1-head state to seed legacy rows into before migrating,
  // and reusing one database across tests would mean later tests see
  // already-migrated (M2-shape) tables.
  let testDb: MigrationTestDb;
  let db: PrismaClient;

  // Shared legacy FK graph (Panchayat/Ward/Category/User/Issue), created
  // fresh for each test via beforeEach so tests don't interfere.
  let panchayatId: string;
  let wardId: string;
  let categoryId: string;
  let citizenId: string;

  async function seedLegacyFkGraph(): Promise<void> {
    const suffix = randomUUID().slice(0, 8);
    panchayatId = `pan_${suffix}`;
    wardId = `ward_${suffix}`;
    categoryId = `cat_${suffix}`;
    citizenId = `user_${suffix}`;

    await db.$executeRawUnsafe(
      `INSERT INTO "Panchayat" (id, code, name, "nameMl", status, "createdAt", "updatedAt")
       VALUES ('${panchayatId}', 'LEG-${suffix}', 'Legacy Panchayat', 'Legacy Panchayat', 'active', now(), now())`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "Ward" (id, number, name, "nameMl", "panchayatId", status)
       VALUES ('${wardId}', 1, 'Legacy Ward', 'Legacy Ward', '${panchayatId}', 'active')`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "Category" (id, slug, name, "nameMl", "sortOrder")
       VALUES ('${categoryId}', 'legacy-${suffix}', 'Legacy Category', 'Legacy Category', 0)`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "User" (id, phone, "preferredLanguage", status, "createdAt", "updatedAt")
       VALUES ('${citizenId}', '+91900000${suffix.slice(0, 4)}', 'en', 'active', now(), now())`,
    );
  }

  /** Inserts an M1-shape Issue (no title/description/status/priority —
   * those columns don't exist pre-M2) and returns its id. */
  async function seedLegacyIssue(opts: { referenceNo: string }): Promise<string> {
    const id = `issue_${randomUUID().slice(0, 8)}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "Issue" (id, "referenceNo", "citizenId", "createdById", "onBehalfOf", "panchayatId", "wardId", "categoryId", "createdAt")
       VALUES ('${id}', '${opts.referenceNo}', '${citizenId}', '${citizenId}', false, '${panchayatId}', '${wardId}', '${categoryId}', now())`,
    );
    return id;
  }

  /** Inserts one legacy `IssueStatusHistory` row (with the OLD `status`
   * column) per given status string, each against its own fresh M1-shape
   * Issue. Returns nothing — assertions read back via raw SQL. */
  async function seedLegacyHistoryRows(statuses: string[]): Promise<void> {
    for (let i = 0; i < statuses.length; i += 1) {
      const issueId = await seedLegacyIssue({ referenceNo: `GRV-LEGACY-${randomUUID().slice(0, 8)}` });
      const historyId = `hist_${randomUUID().slice(0, 8)}`;
      // Stagger createdAt by statement order so ORDER BY "createdAt" is
      // deterministic even though these inserts happen within the same
      // millisecond in a fast test run.
      await db.$executeRawUnsafe(
        `INSERT INTO "IssueStatusHistory" (id, "issueId", status, "createdAt")
         VALUES ('${historyId}', '${issueId}', '${statuses[i]}', now() + interval '${i} milliseconds')`,
      );
    }
  }

  async function runM2Migration(): Promise<void> {
    await testDb.applyM2Migration();
  }

  beforeEach(async () => {
    testDb = new MigrationTestDb();
    await testDb.create();
    db = await testDb.connect();
    await testDb.applyM1Migrations();
    await seedLegacyFkGraph();
  });

  afterEach(async () => {
    // Drop even on failure — this hook always runs regardless of the
    // test's outcome, so no throwaway database is ever left behind.
    await testDb.drop();
  });

  it('preserves legacy IssueStatusHistory rows and nulls the legacy actor', async () => {
    const issueId = await seedLegacyIssue({ referenceNo: 'GRV-LEGACY-SINGLE' });
    await db.$executeRawUnsafe(
      `INSERT INTO "IssueStatusHistory" (id, "issueId", status, "createdAt")
       VALUES ('hist_single', '${issueId}', 'SUBMITTED', now())`,
    );

    await runM2Migration();

    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT "fromStatus","toStatus","changedById" FROM "IssueStatusHistory"`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].fromStatus).toBe('SUBMITTED');
    expect(rows[0].toStatus).toBe('SUBMITTED');
    expect(rows[0].changedById).toBeNull();

    const cols = await db.$queryRawUnsafe<any[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='IssueStatusHistory'`,
    );
    expect(cols.map((c: any) => c.column_name)).not.toContain('status');
  });

  it('maps ALL TEN known legacy status values directly (from=to=value, note NULL)', async () => {
    const known = [
      'SUBMITTED',
      'ACKNOWLEDGED',
      'UNDER_REVIEW',
      'ASSIGNED',
      'IN_PROGRESS',
      'WAITING_FOR_INFORMATION',
      'ESCALATED',
      'RESOLVED',
      'CLOSED',
      'REOPENED',
    ];
    await seedLegacyHistoryRows(known);

    await runM2Migration();

    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT "fromStatus","toStatus","note" FROM "IssueStatusHistory" ORDER BY "createdAt"`,
    );
    expect(rows).toHaveLength(known.length);
    for (let i = 0; i < known.length; i++) {
      expect(rows[i].fromStatus).toBe(known[i]);
      expect(rows[i].toStatus).toBe(known[i]);
      expect(rows[i].note).toBeNull();
    }
  });

  it(
    'safely handles an UNKNOWN legacy status: falls back to SUBMITTED and preserves the ' +
      'original in note (no row lost, migration does not fail)',
    async () => {
      await seedLegacyHistoryRows(['WEIRD_OLD_VALUE']);

      await expect(runM2Migration()).resolves.not.toThrow();

      const rows = await db.$queryRawUnsafe<any[]>(
        `SELECT "fromStatus","toStatus","note" FROM "IssueStatusHistory"`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].toStatus).toBe('SUBMITTED');
      expect(rows[0].fromStatus).toBe('SUBMITTED');
      expect(rows[0].note).toBe('migrated: unrecognized legacy status "WEIRD_OLD_VALUE"');
    },
  );

  it('seeds the reference sequence ABOVE any pre-existing reference so generated refs cannot collide', async () => {
    await seedLegacyIssue({ referenceNo: 'GRV-2026-000005' });

    await runM2Migration();

    const next = await db.$queryRawUnsafe<any[]>(`SELECT nextval('issue_reference_seq') AS n`);
    expect(Number(next[0].n)).toBeGreaterThan(5); // i.e. 6 -> GRV-YYYY-000006, never 000005
  });

  it('loses zero rows across a mixed known+unknown legacy history set', async () => {
    const known = ['SUBMITTED', 'ACKNOWLEDGED', 'RESOLVED'];
    await seedLegacyHistoryRows(known);
    await seedLegacyHistoryRows(['ANOTHER_UNKNOWN_VALUE']);

    const before = await db.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS c FROM "IssueStatusHistory"`);

    await runM2Migration();

    const after = await db.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS c FROM "IssueStatusHistory"`);
    expect(after[0].c).toBe(before[0].c);
    expect(after[0].c).toBe(known.length + 1);
  });
});
