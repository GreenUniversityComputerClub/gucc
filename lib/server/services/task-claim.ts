import type { Ctx } from "../context";
import { nowIso, type D1StatementLike } from "../db";

/**
 * Tasks given to an email address before its account existed now belong to the account (and the
 * person hears about the open ones). Run whenever an account becomes active: approval, an
 * accepted invitation, or email verification when approval isn't required.
 */
export function claimEmailTasksStmts(ctx: Ctx, userId: string, now = nowIso()): D1StatementLike[] {
  return [
    ctx.db.stmt(
      `INSERT INTO notifications (id, user_id, type, title, link, resource_type, resource_id, channel, created_at)
       SELECT 'ntf_' || lower(hex(randomblob(16))), ?1, 'task.assigned', 'Task waiting for you: ' || substr(t.title, 1, 150), '/dashboard/tasks/' || t.id, 'task', t.id, 'IN_APP', ?2
       FROM tasks t WHERE t.assignee_user_id IS NULL AND t.deleted_at IS NULL AND t.status IN ('OPEN','IN_PROGRESS')
         AND t.assignee_email = (SELECT lower(email) FROM users WHERE id = ?1)`, userId, now),
    ctx.db.stmt(
      `UPDATE tasks SET assignee_user_id = ?1, assignee_email = NULL, assignee_name = NULL, updated_at = ?2
       WHERE assignee_user_id IS NULL AND deleted_at IS NULL AND assignee_email = (SELECT lower(email) FROM users WHERE id = ?1)`, userId, now),
  ];
}
