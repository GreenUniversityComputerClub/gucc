"use server";

import { rpc } from "@/lib/api/session";
import type { PersonRow } from "@/lib/server/services/people";

/** Typeahead for every person picker in the admin (authorized by the API). */
export async function searchPeopleAction(q: string, withAccount = false): Promise<PersonRow[]> {
  if (q.trim().length < 2) return [];
  const r = await rpc<PersonRow[]>("people.search", { q, withAccount, limit: 12 });
  return r.ok ? r.data : [];
}

/** Members a member may message (their settings and blocks respected; no emails). */
export async function searchRecipientsAction(q: string): Promise<PersonRow[]> {
  if (q.trim().length < 2) return [];
  const r = await rpc<PersonRow[]>("chat.recipients", { q });
  return r.ok ? r.data : [];
}
