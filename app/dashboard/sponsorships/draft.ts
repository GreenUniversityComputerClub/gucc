/** Where the editor leaves its unsaved content for the live preview tab (this browser only). */
export const draftKey = (id: string) => `sponsorship-draft:${id}`;

export interface SponsorshipDraft {
  content: unknown;
  /** When it was written (ms). */
  at: number;
  /** True right after a save: the preview then shows what's saved. */
  saved: boolean;
}
