import { getPublicEvents, getPublicSetting } from "@/lib/public/data";
import { listBlogPosts } from "@/app/blog/data";
import { getLatestExecutiveYear, getYearRoster } from "@/app/executives/util";
import { isStudentId } from "@/app/executives/shared";

/**
 * What the navbar's search looks through: the site's pages, every event, every blog post and the
 * current committee. Built from the same cached reads as the pages (no extra database work) and
 * fetched by the browser only when someone opens the search.
 */
export const revalidate = 3600;

export interface SearchItem {
  kind: "page" | "event" | "post" | "person";
  title: string;
  href: string;
  /** A second line: a date and place, an author, a position. */
  meta?: string;
  /** Extra words that should find it (never shown). */
  keywords?: string;
  /** When it happened or was published (newest first among equal matches). */
  at?: string;
}

const PAGES: SearchItem[] = [
  { kind: "page", title: "Home", href: "/", keywords: "gucc green university computer club start" },
  { kind: "page", title: "Events", href: "/events", meta: "Seminars, workshops, contests and more", keywords: "calendar programme workshop seminar" },
  { kind: "page", title: "Blog", href: "/blog", meta: "Articles and tutorials by members", keywords: "articles posts writing" },
  { kind: "page", title: "Executives", href: "/executives", meta: "The current committee, and every one since 2016", keywords: "committee president general secretary leaders team" },
  { kind: "page", title: "Contests", href: "/contests", meta: "Programming contests and results", keywords: "icpc competitive programming hackathon" },
  { kind: "page", title: "Join GUCC", href: "/join", meta: "Become a member", keywords: "membership sign up register apply" },
  { kind: "page", title: "Recruitment", href: "/recruitment", meta: "Apply for the executive committee", keywords: "apply volunteer executive" },
  { kind: "page", title: "Sponsors", href: "/sponsors", meta: "Partners who support the club", keywords: "sponsorship partner" },
  { kind: "page", title: "Collaborations", href: "/collaborations", meta: "Clubs and organisations we work with", keywords: "partners clubs" },
  { kind: "page", title: "News", href: "/news", keywords: "announcements updates" },
  { kind: "page", title: "Contact", href: "/contact", meta: "Email, address and message form", keywords: "email address phone location map message" },
  { kind: "page", title: "Sign in", href: "/auth/login", meta: "Members' dashboard", keywords: "login account dashboard" },
];

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00+06:00` : iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : "";

export async function GET() {
  const [events, posts, services, year] = await Promise.all([
    getPublicEvents().catch(() => []),
    listBlogPosts().catch(() => []),
    getPublicSetting<{ items?: Array<{ label: string; href: string; description?: string; visible?: boolean }> }>("nav.services").catch(() => null),
    getLatestExecutiveYear().catch(() => null),
  ]);
  const roster = year ? await getYearRoster(year).catch(() => undefined) : undefined;
  const people = [...(roster?.facultyMembers ?? []), ...(roster?.studentExecutives ?? [])];

  const items: SearchItem[] = [
    ...PAGES,
    ...(services?.items ?? [])
      .filter((s) => s.visible !== false && typeof s.href === "string" && s.href.startsWith("/"))
      .map((s): SearchItem => ({ kind: "page", title: s.label, href: s.href, meta: s.description })),
    ...events.map((e): SearchItem => ({
      kind: "event", title: e.name, href: `/events/${e.slug}`,
      meta: [day(e.startAt ?? e.date), e.location].filter(Boolean).join(" · "),
      keywords: [e.category, e.guest, e.year].filter(Boolean).join(" "),
      at: e.startAt ?? e.date,
    })),
    ...posts.map((p): SearchItem => ({
      kind: "post", title: p.title, href: `/blog/${p.slug}`,
      meta: [p.author?.name, day(p.publishedAt)].filter(Boolean).join(" · "),
      keywords: [...(p.tags ?? []), p.category].filter(Boolean).join(" "),
      at: p.publishedAt ?? undefined,
    })),
    ...people.map((p): SearchItem => ({
      kind: "person", title: p.name,
      href: p.studentId && isStudentId(p.studentId) ? `/executives/${p.studentId}` : `/executives/${year}`,
      meta: [p.position, year ? `${year} committee` : null].filter(Boolean).join(" · "),
      keywords: p.designation ?? undefined,
    })),
  ];
  return Response.json({ items }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400", "X-Robots-Tag": "noindex" },
  });
}
