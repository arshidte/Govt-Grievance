/**
 * Task 3 (M2 migration safety) — throwaway-database harness.
 *
 * Strategy: we need to prove the `m2_issue_lifecycle` migration is safe
 * against a POPULATED pre-M2 (M1-shape) `IssueStatusHistory` table. That
 * means inserting legacy rows via raw SQL BEFORE the M2 migration exists in
 * the table — which requires a real Postgres database sitting at the exact
 * M1 migration state, built outside of Prisma's normal
 * `migrate dev`/`migrate deploy` flow (those always target the single
 * configured `DATABASE_URL`).
 *
 * So: create a brand-new, uniquely-named database on the SAME running dev
 * Postgres instance (the container the rest of the test suite already
 * depends on), apply the existing M1 migration SQL files directly (in
 * order) via `$executeRawUnsafe`, seed legacy rows, then apply the new M2
 * migration SQL the same way. This exercises the *exact* SQL that
 * `prisma migrate deploy` would run, without needing a second Prisma
 * migration history / shadow database.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';

import '../../src/config/env';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');

// The M1 migrations, in application order, that bring a fresh DB to the
// exact pre-M2 shape (plain `status String` column on IssueStatusHistory,
// no title/description/status/priority/updatedAt on Issue, etc).
const M1_MIGRATIONS = ['20261007050553_init_foundation', '20261015000000_roleassignment_integrity'];

// The migration under test, authored in this task.
const M2_MIGRATION = '20261016000000_m2_issue_lifecycle';

function baseConnectionInfo(): { adminUrl: string; buildUrl: (db: string) => string } {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL not set — test/setup-env.ts should have loaded it');
  const buildUrl = (db: string) => {
    const u = new URL(raw);
    u.pathname = `/${db}`;
    return u.toString();
  };
  // Connect to the maintenance DB ("postgres") to issue CREATE/DROP DATABASE.
  const adminUrl = buildUrl('postgres');
  return { adminUrl, buildUrl };
}

/** Splits a migration.sql file into individual statements. Prisma's
 * generated migration files use `;` as the sole statement terminator and
 * never embed a literal `;` inside a string/identifier in this codebase's
 * migrations (verified by inspection), so a straightforward split is
 * sufficient and avoids pulling in a SQL-aware parser for test-only code. */
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) =>
      // Strip leading `-- comment` lines (Prisma annotates each statement,
      // e.g. "-- CreateTable"); keep the SQL itself.
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0)
    .map((s) => s + ';');
}

function readMigration(dirName: string): string {
  return readFileSync(join(MIGRATIONS_DIR, dirName, 'migration.sql'), 'utf-8');
}

export class MigrationTestDb {
  readonly dbName: string;
  private adminClient: PrismaClient | null = null;
  private client: PrismaClient | null = null;
  private readonly buildUrl: (db: string) => string;

  constructor() {
    this.dbName = `m2_migration_test_${randomUUID().replace(/-/g, '')}`;
    const { buildUrl } = baseConnectionInfo();
    this.buildUrl = buildUrl;
  }

  /** Creates the throwaway database on the running dev Postgres instance. */
  async create(): Promise<void> {
    const { adminUrl } = baseConnectionInfo();
    this.adminClient = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    await this.adminClient.$connect();
    // Identifiers can't be parameterized; dbName is our own randomUUID-derived
    // string (no user input), so this is safe.
    await this.adminClient.$executeRawUnsafe(`CREATE DATABASE "${this.dbName}"`);
  }

  /** Returns a connected PrismaClient pointed at the throwaway database. */
  async connect(): Promise<PrismaClient> {
    if (!this.client) {
      this.client = new PrismaClient({ datasources: { db: { url: this.buildUrl(this.dbName) } } });
      await this.client.$connect();
    }
    return this.client;
  }

  /** Applies the existing M1 migrations, in order, bringing the throwaway
   * DB to the exact pre-M2 schema shape. */
  async applyM1Migrations(): Promise<void> {
    const db = await this.connect();
    for (const dir of M1_MIGRATIONS) {
      const sql = readMigration(dir);
      for (const stmt of splitStatements(sql)) {
        await db.$executeRawUnsafe(stmt);
      }
    }
  }

  /** Applies the M2 migration under test. This is the exact SQL
   * `prisma migrate deploy` would run for this migration. */
  async applyM2Migration(): Promise<void> {
    const db = await this.connect();
    const sql = readMigration(M2_MIGRATION);
    for (const stmt of splitStatements(sql)) {
      await db.$executeRawUnsafe(stmt);
    }
  }

  /** Drops the throwaway database. Safe to call even if setup partially
   * failed (used from `afterAll`, including on test failure). */
  async drop(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
      this.client = null;
    }
    if (this.adminClient) {
      try {
        // Terminate any lingering connections to the throwaway DB so DROP
        // DATABASE doesn't fail with "database is being accessed by other users".
        await this.adminClient.$executeRawUnsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${this.dbName}' AND pid <> pg_backend_pid()`,
        );
        await this.adminClient.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${this.dbName}"`);
      } finally {
        await this.adminClient.$disconnect();
        this.adminClient = null;
      }
    }
  }
}
