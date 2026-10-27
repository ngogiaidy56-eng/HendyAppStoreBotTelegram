export interface AuditLogInput {
  actorTelegramId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  /** Metadata only: never include credentials, access tokens, raw bank payloads or inventory secrets. */
  details?: Record<string, string | number | boolean | null | string[]>;
}
