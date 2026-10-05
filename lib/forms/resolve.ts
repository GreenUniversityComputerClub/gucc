/**
 * What the website's server knows about a form beyond what the dashboard stored: for a form that
 * hasn't been checked yet (saved before checking existed), or whose frame address is unknown (a
 * short link), a look at the form itself. Used by the form page (description, sign-in) and by the
 * frame route (the address to show).
 */
import "server-only";
import type { FormSource } from "./types";
import { inspectFormCached } from "./inspect";
import { embedUrlFor } from "./providers";

export interface ResolvedForm {
  embedUrl: string | null;
  requiresSignIn: boolean;
  /** The provider says it no longer takes answers. */
  closed: boolean;
  description: string | null;
  questionCount: number | null;
}

export async function resolveForm(source: FormSource): Promise<ResolvedForm> {
  let embedUrl = source.embedUrl ?? embedUrlFor(source.url);
  let requiresSignIn = source.requiresSignIn;
  let closed = false;
  let description: string | null = null;
  let questionCount: number | null = null;
  if (!source.inspectedAt || !embedUrl) {
    const seen = await inspectFormCached(source.url).catch(() => null);
    if (seen) {
      embedUrl = seen.embedUrl ?? embedUrl;
      // What the dashboard stored about a checked form stays; an unchecked one takes what was seen.
      if (!source.inspectedAt) {
        requiresSignIn = seen.requiresSignIn;
        closed = seen.closed;
        description = seen.description;
        questionCount = seen.questionCount;
      }
    }
  }
  return { embedUrl, requiresSignIn, closed, description, questionCount };
}
