import type { FormDisplay, FormProvider } from "./providers";

/**
 * A form as the public API serves it. Only `slug`, `title` and `url` exist on an API older than
 * migration 0017; everything else is optional and filled in when the dashboard has checked it.
 */
export interface PublicForm {
  slug: string;
  title: string;
  url: string;
  description?: string | null;
  provider?: FormProvider | null;
  embedUrl?: string | null;
  /** The form's own answer page (short links resolved), when checked. */
  openUrl?: string | null;
  requiresSignIn?: boolean | null;
  display?: FormDisplay | null;
  listed?: boolean | null;
  opensAt?: string | null;
  closesAt?: string | null;
  accepting?: boolean | null;
  closedMessage?: string | null;
  questionCount?: number | null;
  category?: string | null;
  /** When the dashboard last looked at the form; never means the page looks itself. */
  inspectedAt?: string | null;
  coverUrl?: string | null;
  event?: { slug: string; title: string } | null;
  updatedAt?: string | null;
}
