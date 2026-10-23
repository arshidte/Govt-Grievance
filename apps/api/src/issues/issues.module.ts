import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';

import { IssueReferenceService } from './issue-reference.service';
import { IssueTransitionService } from './issue-transition.service';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';

@Module({
  imports: [PrismaModule, IdempotencyModule, NotificationsModule, AccessModule, AuthModule],
  controllers: [IssuesController],
  providers: [IssueReferenceService, IssuesService, IssueTransitionService],
  exports: [IssueReferenceService, IssuesService, IssueTransitionService],
})
export class IssuesModule {}
