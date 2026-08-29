import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";

/**
 * Never lets an audit-log write block the primary action it's recording.
 * If the actor's user id is stale (e.g. a session surviving a database
 * reset) or anything else about this insert fails, we log to the server
 * console and move on rather than throwing.
 */
export async function writeAuditLog(entry: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  try {
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
  } catch (err) {
    console.error("Audit log write failed (non-fatal):", err);
  }
}
