import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { NotificationDTO } from '@pg/types';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.service';

import { NotificationsService } from './notifications.service';

/**
 * `GET /notifications`, `GET /notifications/unread-count`, `PATCH
 * /notifications/:id/read` (M2 spec §11, Task 17). Every route requires
 * `AuthGuard` — these are read-side endpoints for the SESSION'S OWN
 * notifications only.
 *
 * This controller is deliberately thin: it does NOT do any
 * recipient-scoping itself. Every scoping decision (the `recipientId`
 * filter for the list/count reads, and the ownership check + non-disclosing
 * 404 for mark-read) lives in `NotificationsService` — see that file's
 * doc-comments for the "why" of each. Mirrors the
 * controller-is-thin/service-owns-authz split used by `IssuesController`.
 *
 * `unread-count` is declared as its own literal path segment ahead of
 * `:id/read` below is irrelevant for Nest's router (it matches by full
 * pattern, not declaration order) — but it IS a distinct static route, not
 * a param, so there is no collision with a (nonexistent) `GET :id` route.
 */
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * The caller's own notifications, newest-first. Recipient-scoping is
   * enforced inside `NotificationsService.listFor` at the DB query level.
   */
  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<NotificationDTO[]> {
    return this.notifications.listFor(user);
  }

  /** The caller's own unread notification count. */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: SessionUser): Promise<{ count: number }> {
    return this.notifications.unreadCount(user);
  }

  /**
   * Marks one of the CALLER'S OWN notifications read. A notification that
   * does not exist, or exists but belongs to someone else, both produce the
   * SAME non-disclosing 404 (`notification_not_found`) from
   * `NotificationsService.markRead` — never a 403, which would leak that
   * the id is valid for a different recipient.
   */
  @Patch(':id/read')
  async markRead(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<NotificationDTO> {
    return this.notifications.markRead(user, id);
  }
}
