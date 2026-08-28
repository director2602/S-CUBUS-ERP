import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";

export async function writeAuditLog(entry: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  db.insert(auditLogs)
    .values({
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      oldValue: entry.oldValue !== undefined ? JSON.stringify(entry.oldValue) : null,
      newValue: entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null,
    })
    .run();
}
