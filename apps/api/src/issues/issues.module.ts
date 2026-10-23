import { Module } from '@nestjs/common';

import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';

import { IssueReferenceService } from './issue-reference.service';
import { IssuesService } from './issues.service';

@Module({
  imports: [PrismaModule, IdempotencyModule, NotificationsModule],
  providers: [IssueReferenceService, IssuesService],
  exports: [IssueReferenceService, IssuesService],
})
export class IssuesModule {}
