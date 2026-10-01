import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { getSession, rpc } from "@/lib/api/session";
import type { membersDirectory } from "@/lib/server/services/profiles";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Members", description: "Find GUCC members by name, department, batch or skill.", robots: { index: false, follow: false } };

type Directory = Awaited<ReturnType<typeof membersDirectory>>;

export default async function MembersDirectory({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session || session.user.status !== "ACTIVE") {
    return (
      <div className="container flex max-w-lg flex-col items-center py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Users className="h-7 w-7 text-muted-foreground" aria-hidden /></span>
        <h1 className="mt-4 text-2xl font-bold">Members directory</h1>
        <p className="mt-2 text-muted-foreground">{session ? "The directory opens once your membership is approved." : "Sign in as a GUCC member to find other members and visit their profiles."}</p>
        {!session && <Button asChild className="mt-6 min-h-11"><Link href="/auth/login?next=%2Fmembers">Sign in</Link></Button>}
      </div>
    );
  }
  const page = Math.max(1, Number(sp.page) || 1);
  const r = await rpc<Directory>("members.directory", { q: sp.q ?? "", department: sp.department ?? "", batch: sp.batch ?? "", page });
  const data = r.ok ? r.data : { rows: [], page, hasMore: false };
  const query = (p: number) => `/members?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.department ? { department: sp.department } : {}), ...(sp.batch ? { batch: sp.batch } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="container max-w-6xl py-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Members</h1>
        <p className="mt-1 text-muted-foreground">Find members by name, department, batch or skill, and visit their profiles. Members who keep their profile private aren&apos;t listed.</p>
      </header>
      <form role="search" className="mb-6 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,8rem)_auto]">
        <label className="relative">
          <span className="sr-only">Name or skill</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Name or skill (e.g. React)" className="h-11 w-full rounded-md border bg-background pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:text-sm" />
        </label>
        <label><span className="sr-only">Department</span><input name="department" defaultValue={sp.department ?? ""} placeholder="Department" className="h-11 w-full rounded-md border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:text-sm" /></label>
        <label><span className="sr-only">Batch</span><input name="batch" defaultValue={sp.batch ?? ""} placeholder="Batch" inputMode="numeric" className="h-11 w-full rounded-md border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:text-sm" /></label>
        <Button type="submit" className="min-h-11 md:min-h-10">Search</Button>
      </form>
      {!r.ok && <p role="alert" className="mb-4 text-sm text-destructive">The directory couldn&apos;t load just now. Please try again.</p>}
      {data.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No members match. {(sp.q || sp.department || sp.batch) && <Link href="/members" className="underline">Clear the search</Link>}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.rows.map((m) => (
            <li key={m.handle}>
              <Link prefetch={false} href={`/members/${encodeURIComponent(m.handle)}`} className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <PersonAvatar name={m.name} url={m.avatarUrl} size="lg" className="h-14 w-14" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{m.name}</span>
                  {m.positions && <span className="mt-0.5 block truncate text-sm text-primary">{m.positions}</span>}
                  <span className="block truncate text-xs text-muted-foreground">{[m.faculty ? "Faculty" : null, m.department, m.batch ? `Batch ${m.batch}` : null].filter(Boolean).join(" · ")}</span>
                  {m.skills.length > 0 && <span className="mt-2 flex flex-wrap gap-1">{m.skills.map((s) => <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{s}</span>)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || data.hasMore) && (
        <nav aria-label="Pages" className="mt-8 flex justify-center gap-2">
          {page > 1 && <Button asChild variant="outline" className="min-h-11"><Link href={query(page - 1)}>Previous</Link></Button>}
          {data.hasMore && <Button asChild variant="outline" className="min-h-11"><Link href={query(page + 1)}>Next</Link></Button>}
        </nav>
      )}
    </div>
  );
}
