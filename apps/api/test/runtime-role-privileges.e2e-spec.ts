import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import '../src/config/env';

import { purgeAuditLogs } from './helpers/append-only';

/**
 * M4D, Part B — proves the LEAST-PRIVILEGE runtime role is correctly
 * constrained. Unlike every other spec (which connects with the admin/
 * migration identity to seed + purge append-only rows), this one opens a
 * connection AS THE RUNTIME ROLE via `RUNTIME_DATABASE_URL` and asserts the
 * full allow/deny matrix the application depends on:
 *
 *   ALLOW  — CONNECT, SELECT, full DML on ordinary tables, INSERT on AuditLog,
 *            and a transactional insert+audit (the `recordTx` write path).
 *   DENY   — UPDATE/DELETE/TRUNCATE on AuditLog, disabling/dropping the M4C
 *            append-only triggers, ALTERing the AuditLog table, creating
 *            schema objects, and the superuser-only trigger bypass
 *            (`session_replication_role='replica'`). The role must also carry
 *            no elevated attributes (superuser/createdb/createrole/replication).
 *
 * Self-skips when `RUNTIME_DATABASE_URL` is unset (role not provisioned), so
 * the suite stays green on a pre-M4D environment; CI provisions the role and
 * sets the var, so it runs for real there. Cleanup of the AuditLog rows this
 * spec inserts uses the admin identity (`purgeAuditLogs`) — itself evidence
 * that the runtime role cannot remove them.
 */
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL;

describe.skipIf(!RUNTIME_URL)('Runtime role least-privilege (M4D, e2e)', () => {
  let runtime: PrismaClient; // connected AS the least-privilege role
  const admin = new PrismaService(); // admin identity (forced by setup-env)

  const runId = `rtrole-${Date.now()}`;
  const insertedAuditIds: string[] = [];
  const insertedCategoryIds: string[] = [];

  beforeAll(async () => {
    runtime = new PrismaClient({ datasources: { db: { url: RUNTIME_URL! } } });
    await runtime.$connect();
  });

  afterAll(async () => {
    // The runtime role CANNOT delete AuditLog rows — only the admin can.
    if (insertedAuditIds.length) await purgeAuditLogs(admin, { id: { in: insertedAuditIds } });
    if (insertedCategoryIds.length) {
      await admin.category.deleteMany({ where: { id: { in: insertedCategoryIds } } });
    }
    await runtime.$disconnect();
    await admin.$disconnect();
  });

  // ---- The role carries no elevated attributes --------------------------

  it('is not a superuser and holds no CREATE* / REPLICATION attributes', async () => {
    const rows = await runtime.$queryRawUnsafe<
      { rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolreplication: boolean }[]
    >(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication
         FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
    });
  });

  // ---- ALLOW: ordinary application work ---------------------------------

  it('can SELECT, and INSERT/UPDATE/DELETE on an ordinary table', async () => {
    const one = await runtime.$queryRawUnsafe<{ ok: number }[]>('SELECT 1 AS ok');
    expect(one[0]!.ok).toBe(1);

    const cat = await runtime.category.create({
      data: { slug: `${runId}-rw`, name: 'RW', nameMl: 'ml' },
    });
    insertedCategoryIds.push(cat.id);
    const updated = await runtime.category.update({ where: { id: cat.id }, data: { name: 'RW2' } });
    expect(updated.name).toBe('RW2');
    await runtime.category.delete({ where: { id: cat.id } });
    expect(await runtime.category.findUnique({ where: { id: cat.id } })).toBeNull();
    insertedCategoryIds.pop(); // deleted above
  });

  it('can INSERT AuditLog, including the transactional insert+audit write path', async () => {
    const row = await runtime.auditLog.create({
      data: { action: `${runId}.insert`, entityType: 'Test' },
    });
    insertedAuditIds.push(row.id);

    // The recordTx path: an ordinary mutation + its audit row in one tx.
    await runtime.$transaction(async (tx) => {
      const cat = await tx.category.create({
        data: { slug: `${runId}-tx`, name: 'TX', nameMl: 'ml' },
      });
      insertedCategoryIds.push(cat.id);
      const audit = await tx.auditLog.create({
        data: { action: `${runId}.tx`, entityType: 'Category', entityId: cat.id },
      });
      insertedAuditIds.push(audit.id);
    });
    expect(await runtime.auditLog.count({ where: { action: `${runId}.tx` } })).toBe(1);
  });

  // ---- DENY: AuditLog is append-only for the runtime role ----------------

  it('cannot UPDATE, DELETE, or TRUNCATE AuditLog', async () => {
    const row = await runtime.auditLog.create({
      data: { action: `${runId}.immutable`, entityType: 'Test' },
    });
    insertedAuditIds.push(row.id);

    await expect(
      runtime.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow();
    await expect(runtime.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    await expect(runtime.$executeRawUnsafe('TRUNCATE "AuditLog"')).rejects.toThrow();

    // Row still intact.
    const still = await runtime.auditLog.findUnique({ where: { id: row.id } });
    expect(still?.action).toBe(`${runId}.immutable`);
  });

  // ---- DENY: cannot subvert the triggers or the schema -------------------

  it('cannot disable or drop the append-only triggers', async () => {
    await expect(
      runtime.$executeRawUnsafe('ALTER TABLE "AuditLog" DISABLE TRIGGER USER'),
    ).rejects.toThrow();
    await expect(
      runtime.$executeRawUnsafe('DROP TRIGGER auditlog_no_update_delete ON "AuditLog"'),
    ).rejects.toThrow();
  });

  it('cannot ALTER the AuditLog table or create new schema objects', async () => {
    await expect(
      runtime.$executeRawUnsafe('ALTER TABLE "AuditLog" ADD COLUMN hacked text'),
    ).rejects.toThrow();
    await expect(
      runtime.$executeRawUnsafe(`CREATE TABLE "${runId}_hack" (id int)`),
    ).rejects.toThrow();
  });

  it('cannot escalate via session_replication_role (superuser-only)', async () => {
    await expect(
      runtime.$executeRawUnsafe(`SET session_replication_role = 'replica'`),
    ).rejects.toThrow();
  });
});
