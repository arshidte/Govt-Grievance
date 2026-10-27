import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';

import { IssueReferenceService } from './issue-reference.service';
import { IssueTransitionService } from './issue-transition.service';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { OnBehalfRateLimit } from './on-behalf-rate-limit';
import { OnBehalfService } from './on-behalf.service';

@Module({
  imports: [PrismaModule, IdempotencyModule, NotificationsModule, AccessModule, AuthModule, AuditModule],
  controllers: [IssuesController],
  providers: [IssueReferenceService, IssuesService, IssueTransitionService, OnBehalfRateLimit, OnBehalfService],
  exports: [IssueReferenceService, IssuesService, IssueTransitionService, OnBehalfService],
})
export class IssuesModule {}
