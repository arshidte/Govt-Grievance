import { Module } from '@nestjs/common';

import { IssueReferenceService } from './issue-reference.service';

@Module({
  providers: [IssueReferenceService],
  exports: [IssueReferenceService],
})
export class IssuesModule {}
