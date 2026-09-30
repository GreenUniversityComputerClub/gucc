import { Field, FormSection } from "@/components/admin/ui";
import { MediaField } from "@/components/admin/media-field";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { dhakaLocalInput } from "@/lib/time";

const dt = (v: unknown) => dhakaLocalInput(typeof v === "string" ? v : null);

/**
 * Writing a post: the words on the left (title, subtitle, the body with formatting and a preview,
 * the excerpt), and beside them on wide screens what the post is filed under, when it goes out,
 * its picture and how it looks in search and on social media. On phones everything stacks.
 */
export function PostFields({ p, type, coverUrl, categories = [] }: { p?: Record<string, unknown>; type: string; coverUrl?: string | null; categories?: Array<{ slug: string; name: string }> }) {
  const v = (k: string) => (p?.[k] as string | number | null | undefined) ?? null;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <input type="hidden" name="type" value={type} />
      <div className="min-w-0 space-y-5">
        <FormSection title="Writing">
          <Field name="title" label="Title" defaultValue={v("title")} required placeholder="A clear, specific title" />
          <Field name="subtitle" label="Subtitle" defaultValue={v("subtitle")} placeholder="One line that says what readers get" />
          <MarkdownEditor name="body" label="Body" defaultValue={v("body_markdown") as string | null} draftKey={`post:${String(v("id") ?? `new-${type}`)}`}
            hint="Markdown. Use the toolbar or type **bold**, _italic_, ## headings; paste or drop images. HTML and scripts are shown as text, never run." />
          <Field name="excerpt" label="Excerpt" type="textarea" rows={2} defaultValue={v("excerpt")} hint="Shown on the blog's cards. Leave empty to use the subtitle." />
        </FormSection>
      </div>

      <div className="min-w-0 space-y-5">
        <FormSection title="Category and schedule">
          <Field name="category" label="Category" defaultValue={v("category_name")} list="post-categories" placeholder="Technical, Club News…" hint="The category can decide who may publish (e.g. Technical)." />
          <datalist id="post-categories">{categories.map((c) => <option key={c.slug} value={c.name} />)}</datalist>
          <Field name="tags" label="Tags" defaultValue={v("tags")} placeholder="python, machine learning" hint="Comma separated." />
          <Field name="scheduledAt" label="Publish at (optional)" type="datetime-local" defaultValue={dt(v("scheduled_at"))} hint="Leave empty to publish as soon as it's approved." />
        </FormSection>

        <FormSection title="Featured image">
          <MediaField name="featuredMediaId" label="Cover" defaultId={v("featured_media_id") as string | null} defaultUrl={coverUrl} />
        </FormSection>

        <FormSection title="Search and sharing" description="What Google and shared links show.">
          <Field name="seoTitle" label="SEO title" defaultValue={v("seo_title")} hint="About 50–60 characters. Leave empty to use the title." />
          <Field name="seoDescription" label="SEO description" type="textarea" rows={3} defaultValue={v("seo_description")} hint="About 120–160 characters." />
          <Field name="slug" label="URL slug" defaultValue={v("slug")} hint="Leave empty to derive from the title." />
          <Field name="canonicalUrl" label="Canonical URL" type="url" defaultValue={v("canonical_url")} hint="Only when the article's home is elsewhere (e.g. Substack)." />
        </FormSection>

        <FormSection title="Revision">
          <Field name="changeReason" label="Change note (saved with this revision)" placeholder="e.g. Fixed the code example" />
        </FormSection>
      </div>
    </div>
  );
}
