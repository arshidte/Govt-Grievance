import { Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { createIssueSchema, type CreateIssueInput, type IssueDetailDTO, type IssueSummaryDTO } from '@pg/types';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { IssuesService } from './issues.service';

/**
 * `POST /issues`, `GET /issues`, `GET /issues/:id` (M2 spec §6). Every route
 * requires `AuthGuard` — even `GET /issues/:id`'s eventual 404 for an
 * out-of-scope caller must never be reachable without a session.
 *
 * No on-behalf creation (Task 13), no status transition (Task 11), no
 * attachment upload (Task 16) here — those are separate routes/tasks.
 */
@Controller('issues')
@UseGuards(AuthGuard)
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  /**
   * Citizen self-submission. The body is validated by `createIssueSchema`
   * (via `ZodValidationPipe`) into the exact `CreateIssueInput` shape the
   * service expects — this controller does NOT compute a fingerprint
   * itself; it passes the validated dto and the raw `Idempotency-Key`
   * header value straight through to `IssuesService.createForCitizen`,
   * which is the single source of truth for idempotency fingerprinting
   * (see Task 7 review note: don't duplicate that logic here).
   */
  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createIssueSchema)) dto: CreateIssueInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<IssueDetailDTO> {
    return this.issues.createForCitizen(user, dto, idempotencyKey);
  }

  /**
   * Scoped list: a CITIZEN sees only their own issues; STAFF see every
   * issue within their role's scope. All scoping happens inside
   * `IssuesService.listFor` (DB-level filter, not a post-fetch filter).
   */
  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<IssueSummaryDTO[]> {
    return this.issues.listFor(user);
  }

  /**
   * Scoped single-issue read. Returns the full `IssueDetailDTO` (timeline
   * included, empty until Task 10/11 land transitions) if `user` is the
   * owning citizen or in-scope staff; otherwise `IssuesService.getForUser`
   * throws a 404 — deliberately indistinguishable from a genuinely
   * nonexistent id, so this never discloses an out-of-scope issue's
   * existence to the caller.
   */
  @Get(':id')
  async get(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<IssueDetailDTO> {
    return this.issues.getForUser(user, id);
  }
}
