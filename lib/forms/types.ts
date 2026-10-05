import type { FormProvider } from "./providers";

/**
 * A form as the public API serves it. It never carries the form's own address: the page shows the
 * form inside itself, and the address reaches the browser only through the page's frame route
 * (see `FormSource`). Only `slug` and `title` exist on an API older than migration 0017;
 * everything else is optional and filled in when the dashboard has checked the form.
 */
export interface PublicForm {
  slug: string;
  title: string;
  description?: string | null;
  provider?: FormProvider | null;
  requiresSignIn?: boolean | null;
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

/**
 * Where a form really is. Only the website's server reads this (the frame route and the page's
 * checks); it is not part of any cached page or list.
 */
export interface FormSource {
  url: string;
  embedUrl: string | null;
  requiresSignIn: boolean;
  inspectedAt: string | null;
  accepting: boolean;
  opensAt: string | null;
  closesAt: string | null;
}
