/**
 * Recipient-facing notification representation. Deliberately omits
 * `recipientId`/`statusHistoryId` (internal linkage, not needed by the
 * client) — mirrors the Notification model's public-facing fields only.
 */
export interface NotificationDTO {
  id: string;
  type: string;
  issueId: string | null;
  readAt: string | null;
  createdAt: string;
}
