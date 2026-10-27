import { z } from 'zod';
import { phoneSchema } from './auth';
import { IssueStatusEnum, PriorityEnum } from './enums';

/** Citizen-submitted new-issue payload. */
export const createIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  categoryId: z.string().min(1),
  subcategoryId: z.string().min(1).optional(),
  panchayatId: z.string().min(1),
  wardId: z.string().min(1),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

/**
 * Representative-submitted "on behalf of a citizen" payload. Omits
 * `panchayatId` — the representative's own ward scope implies the
 * panchayat server-side — and requires `citizenPhone` to identify/create
 * the citizen record the issue is filed against.
 */
export const createOnBehalfSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  categoryId: z.string().min(1),
  subcategoryId: z.string().min(1).optional(),
  wardId: z.string().min(1),
  citizenPhone: phoneSchema,
});
export type CreateOnBehalfInput = z.infer<typeof createOnBehalfSchema>;

/** Staff-initiated status transition payload; note is mandatory (audit trail). */
export const transitionSchema = z.object({
  toStatus: IssueStatusEnum,
  note: z.string().min(1).max(1000),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

/** Lightweight issue representation for list views. */
export interface IssueSummaryDTO {
  id: string;
  referenceNo: string;
  title: string;
  status: z.infer<typeof IssueStatusEnum>;
  priority: z.infer<typeof PriorityEnum>;
  categoryId: string;
  createdAt: string;
}

/**
 * A single status-change event in an issue's timeline. Exposes the
 * actor's ROLE label (e.g. "Coordinator"), never actor PII (name/phone/id)
 * — this DTO may be visible to the citizen who filed the issue.
 */
export interface IssueStatusHistoryDTO {
  id: string;
  fromStatus: z.infer<typeof IssueStatusEnum>;
  toStatus: z.infer<typeof IssueStatusEnum>;
  note: string | null;
  actorRoleLabel: string | null;
  createdAt: string;
}

/** Metadata for a single file attached to an issue. */
export interface AttachmentDTO {
  id: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  createdAt: string;
}

/** Full issue representation for detail views. */
export interface IssueDetailDTO {
  id: string;
  referenceNo: string;
  title: string;
  status: z.infer<typeof IssueStatusEnum>;
  priority: z.infer<typeof PriorityEnum>;
  categoryId: string;
  createdAt: string;
  description: string;
  panchayatId: string;
  wardId: string;
  subcategoryId: string | null;
  onBehalfOf: boolean;
  timeline: IssueStatusHistoryDTO[];
  attachment: AttachmentDTO | null;
}
