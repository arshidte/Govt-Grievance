import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Row shape returned by `SELECT nextval(...)`. Prisma's `$queryRaw` types raw
 * results as `unknown` by default; `any` here is a deliberate, narrow escape
 * hatch to read the single `nextval` column before immediately converting it
 * to a string below — it is not used anywhere else.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NextvalRow = { nextval: any };

/**
 * Produces globally unique, human-readable issue reference numbers of the
 * form `GRV-<YYYY>-<NNNNNN>`.
 *
 * Uniqueness and concurrency-safety come entirely from PostgreSQL's
 * `issue_reference_seq` sequence (created in the Task 3 migration):
 * `nextval()` is atomic at the database level, so concurrent callers can
 * never receive the same number, even across multiple API processes.
 */
@Injectable()
export class IssueReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(now: Date): Promise<string> {
    const year = now.getFullYear();

    const rows = await this.prisma.$queryRaw<NextvalRow[]>`SELECT nextval('issue_reference_seq')`;
    const raw = rows[0]?.nextval;

    if (raw === undefined || raw === null) {
      throw new Error('issue_reference_seq.nextval() returned no row');
    }

    // nextval() returns a bigint. Coerce via String(), never Number(), to
    // avoid silent precision loss once the sequence exceeds 2^53.
    const sequenceValue = String(raw);
    const padded = sequenceValue.padStart(6, '0');

    return `GRV-${year}-${padded}`;
  }
}
