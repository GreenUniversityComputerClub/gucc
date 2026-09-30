import { Field } from "@/components/admin/ui";
import { MediaField } from "@/components/admin/media-field";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { dhakaLocalInput } from "@/lib/time";

const dt = (v: unknown) => dhakaLocalInput(typeof v === "string" ? v : null);

export function PostFields({ p, type, coverUrl, categories = [] }: { p?: Record<string, unknown>; type: string; coverUrl?: string | null; categories?: Array<{ slug: string; name: string }> }) {
  const v = (k: string) => (p?.[k] as string | number | null | undefined) ?? null;
  return (
    <div className="space-y-4">
      <input type="hidden" name="type" value={type} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="title" label="Title" defaultValue={v("title")} required />
        <Field name="slug" label="URL slug" defaultValue={v("slug")} hint="Leave empty to derive from the title." />
        <Field name="subtitle" label="Subtitle" defaultValue={v("subtitle")} />
        <Field name="category" label="Category" defaultValue={v("category_name")} list="post-categories" placeholder="Technical, Club News…" hint="The category can decide who may publish (e.g. Technical)." />
        <datalist id="post-categories">{categories.map((c) => <option key={c.slug} value={c.name} />)}</datalist>
        <Field name="tags" label="Tags" defaultValue={v("tags")} placeholder="comma, separated" />
        <Field name="scheduledAt" label="Publish at (optional)" type="datetime-local" defaultValue={dt(v("scheduled_at"))} hint="Leave empty to publish immediately when approved." />
      </div>
      <Field name="excerpt" label="Excerpt" type="textarea" rows={2} defaultValue={v("excerpt")} />
      <MarkdownEditor name="body" label="Body" defaultValue={v("body_markdown") as string | null} draftKey={`post:${String(v("id") ?? `new-${type}`)}`} hint="Markdown. Use the toolbar or type **bold**, _italic_, ## headings. HTML and scripts are shown as text, never run." />
      <MediaField name="featuredMediaId" label="Featured image" defaultId={v("featured_media_id") as string | null} defaultUrl={coverUrl} />
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">SEO & canonical link</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Field name="seoTitle" label="SEO title" defaultValue={v("seo_title")} hint="About 50–60 characters. Leave empty to use the title." />
          <Field name="seoDescription" label="SEO description" defaultValue={v("seo_description")} hint="About 120–160 characters: what a search result or a shared link shows under the title." />
          <Field name="canonicalUrl" label="Canonical URL" type="url" defaultValue={v("canonical_url")} hint="Set when the article's home is elsewhere (e.g. Substack)." className="md:col-span-2" />
        </div>
      </details>
      <Field name="changeReason" label="Change note (saved with this revision)" />
    </div>
  );
}
