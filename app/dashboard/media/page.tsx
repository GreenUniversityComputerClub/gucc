import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { MediaListRow, mediaDetails } from "@/lib/server/services/media";
import { mediaUrl } from "@/lib/public/shapes";
import { mediaHref } from "@/lib/api/config";
import { OpenPrivate } from "./open-private";
import { ActionForm, EmptyState, PageHeader, Pager } from "@/components/admin/ui";
import { archiveMediaAction, purgeMediaAction, updateMediaAction } from "../actions";
import { Uploader } from "./uploader";
import { ReplaceImage } from "./replace-image";

export default async function MediaAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAdmin("/dashboard/media");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const [rows, details] = await Promise.all([
    view<MediaListRow[]>("media.list", { q: sp.q || undefined, type: sp.type || undefined, visibility: sp.visibility || undefined, page, unused: sp.unused === "1", stale: sp.stale === "1", archived: sp.archived === "1" }, "/dashboard/media"),
    sp.details ? view<Awaited<ReturnType<typeof mediaDetails>>>("media.details", { id: sp.details }, "/dashboard/media") : Promise.resolve(null),
  ]);
  const keep = { q: sp.q, type: sp.type, visibility: sp.visibility, unused: sp.unused, stale: sp.stale, archived: sp.archived, page: sp.page };
  const href = (extra: Record<string, string | undefined>) => `/dashboard/media?${new URLSearchParams(Object.fromEntries(Object.entries({ ...keep, ...extra }).filter(([, v]) => v)) as Record<string, string>)}`;
  const size = (n: number | null) => (n === null ? "—" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
  const mayUpload = Boolean(session.caps["media.upload"]);
  const mayUpdate = Boolean(session.caps["media.update"]);
  const mayPurge = Boolean(session.caps["media.delete"]);
  const purgeCutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();

  return (
    <>
      <PageHeader title="Media" description="Files live in Cloudflare R2; this library holds their details. Images are resized and converted to WebP before upload. Files still in use cannot be archived." />
      {mayUpload && <Uploader />}
      <form className="my-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="File name or alt text" aria-label="Search" className="h-10 md:h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-base md:text-sm sm:min-w-56" />
        <select name="type" aria-label="Type" defaultValue={sp.type ?? ""} className="h-10 md:h-9 rounded-md border bg-background px-3 text-base md:text-sm">
          <option value="">All types</option><option value="IMAGE">Images</option><option value="DOCUMENT">Documents</option>
        </select>
        <select name="visibility" aria-label="Visibility" defaultValue={sp.visibility ?? ""} className="h-10 md:h-9 rounded-md border bg-background px-3 text-base md:text-sm">
          <option value="">Any visibility</option><option value="PUBLIC">Public</option><option value="PRIVATE">Private</option><option value="RESTRICTED">Restricted</option>
        </select>
        <label className="flex min-h-9 items-center gap-1 text-sm"><input type="checkbox" name="unused" value="1" defaultChecked={sp.unused === "1"} /> Unused only</label>
        <label className="flex min-h-9 items-center gap-1 text-sm"><input type="checkbox" name="stale" value="1" defaultChecked={sp.stale === "1"} /> Unused 30+ days</label>
        <label className="flex min-h-9 items-center gap-1 text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} /> Archived</label>
        <button className="h-10 rounded-md border px-4 text-sm md:h-9">Filter</button>
      </form>
      {details && (
        <section aria-labelledby="media-details" className="mb-4 rounded-xl border bg-card p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 id="media-details" className="break-all font-semibold">{details.file.original_filename ?? details.file.legacy_path}</h2>
            <Link prefetch={false} href={href({ details: undefined })} className="text-xs underline">Close</Link>
          </div>
          <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-y-1 sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground">Type</dt><dd>{details.file.mime_type ?? details.file.media_type}{details.file.width && details.file.height ? ` · ${details.file.width}×${details.file.height}` : ""} · {size(details.file.size_bytes)}</dd>
            <dt className="text-muted-foreground">Stored</dt><dd>{details.file.storage === "STATIC" ? "Legacy file on the website" : `Cloudflare R2 (${details.file.visibility.toLowerCase()})`}</dd>
            <dt className="text-muted-foreground">Uploaded</dt><dd>{new Date(details.file.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}{details.file.uploader ? ` by ${details.file.uploader}` : ""}</dd>
            {details.file.checksum_sha256 && <><dt className="text-muted-foreground">Checksum</dt><dd className="break-all font-mono text-xs">{details.file.checksum_sha256.slice(0, 16)}…</dd></>}
          </dl>
          {mayUpdate && details.file.media_type === "IMAGE" && <ReplaceImage mediaId={details.file.id} />}
          <h3 className="mt-3 font-medium">Used in {details.usage.length} place{details.usage.length === 1 ? "" : "s"}</h3>
          {details.usage.length === 0 ? (
            <p className="text-muted-foreground">Not used anywhere, so it can be archived.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {details.usage.map((u, i) => (
                <li key={i}><span className="text-muted-foreground">{u.kind}:</span> {u.link ? <Link prefetch={false} href={u.link} className="underline">{u.label}</Link> : u.label}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {rows.length === 0 ? <EmptyState>No files match.</EmptyState> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((m) => {
            const url = m.visibility === "PUBLIC" ? mediaHref(mediaUrl({ ...m, storage: m.storage as "R2" }, "thumb")) : undefined;
            return (
              <div key={m.id} className="overflow-hidden rounded-xl border bg-card text-xs">
                {m.media_type === "IMAGE" && url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={m.alt_text ?? ""} loading="lazy" className="h-32 w-full object-cover" />
                ) : (
                  <div className="flex h-32 flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
                    <span>{m.visibility === "PUBLIC" ? m.mime_type ?? "file" : `${m.visibility.toLowerCase()} ${m.media_type === "IMAGE" ? "image" : "file"}`}</span>
                    {m.storage === "R2" && m.visibility !== "PUBLIC" && <OpenPrivate id={m.id} />}
                  </div>
                )}
                <div className="space-y-1 p-2">
                  <p className="truncate font-medium" title={m.original_filename ?? m.legacy_path ?? ""}>{m.original_filename ?? m.legacy_path}</p>
                  <p className="text-muted-foreground">{m.storage === "STATIC" ? "legacy file" : m.visibility.toLowerCase()} · {m.width && m.height ? `${m.width}×${m.height}` : ""} · <Link prefetch={false} href={href({ details: m.id })} className="underline">used {m.refs}×</Link></p>
                  {m.storage === "R2" && m.deleted_at && (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Archived {new Date(m.deleted_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" })}.</p>
                      {mayPurge && m.refs === 0 && (m.deleted_at <= purgeCutoff ? (
                        <ActionForm action={purgeMediaAction.bind(null, m.id)} submitLabel="Delete permanently" variant="destructive"
                          confirm="Delete this file for good? It's archived and unused, and it can't be brought back." />
                      ) : <p className="text-muted-foreground">Can be deleted permanently 30 days after archiving.</p>)}
                    </div>
                  )}
                  {m.storage === "R2" && !m.deleted_at && (
                    <details>
                      <summary className="cursor-pointer underline">Edit</summary>
                      <div className="mt-2 space-y-2">
                        <ActionForm action={updateMediaAction.bind(null, m.id)} submitLabel="Save">
                          <input name="alt" defaultValue={m.alt_text ?? ""} placeholder="Alt text" aria-label="Alt text" className="h-10 w-full rounded-md border bg-background px-2 text-base md:h-8 md:text-xs" />
                          <select name="visibility" defaultValue={m.visibility} aria-label="Visibility" className="h-10 w-full rounded-md border bg-background px-2 text-base md:h-8 md:text-xs">
                            <option value="PUBLIC">Public</option><option value="PRIVATE">Private</option><option value="RESTRICTED">Restricted</option>
                          </select>
                        </ActionForm>
                        {m.refs === 0 && <ActionForm action={archiveMediaAction.bind(null, m.id)} submitLabel="Archive" variant="destructive" confirm="Archive this file?" />}
                        {mayPurge && m.refs === 0 && m.unreferenced_since && m.unreferenced_since <= purgeCutoff && (
                          <ActionForm action={purgeMediaAction.bind(null, m.id)} submitLabel="Delete permanently" variant="destructive"
                            confirm="Delete this file for good? Nothing uses it, and it can't be brought back." />
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pager page={page} hasMore={rows.length === 48} base="/dashboard/media" params={{ q: sp.q, type: sp.type, visibility: sp.visibility, unused: sp.unused, stale: sp.stale, archived: sp.archived }} />
    </>
  );
}
