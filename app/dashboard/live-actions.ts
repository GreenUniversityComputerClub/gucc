"use server";

import { rpc } from "@/lib/api/session";
import type { NotificationRow } from "./notifications/list";

/**
 * Small, frequent calls from dashboard pages: no page refresh and no cache work, so they stay
 * cheap. Each answers quietly (a failure only means the badge updates a little later).
 */

/** Opening a page clears the notifications that point to it. Returns how many were cleared. */
export async function seenPathAction(path: string): Promise<number> {
  const r = await rpc<{ cleared: number }>("notifications.seenPath", { path: path.slice(0, 500) });
  return r.ok ? r.data.cleared : 0;
}

/** Notifications seen in the list (a batch of ids). */
export async function markSeenAction(ids: string[]): Promise<boolean> {
  const r = await rpc("notifications.markRead", { ids: ids.slice(0, 100) });
  return r.ok;
}

export async function markUnreadAction(id: string): Promise<boolean> {
  const r = await rpc("notifications.markUnread", { id });
  return r.ok;
}

export async function markAllSeenAction(): Promise<boolean> {
  const r = await rpc("notifications.markRead", { ids: "all" });
  return r.ok;
}

/** The newest notifications, for the list when a new one arrives live (no page reload). */
export async function latestNotificationsAction(unreadOnly: boolean): Promise<NotificationRow[] | null> {
  const r = await rpc<{ rows: NotificationRow[] }>("notifications.list", { limit: 30, unread: unreadOnly });
  return r.ok && Array.isArray(r.data.rows) ? r.data.rows : null;
}
