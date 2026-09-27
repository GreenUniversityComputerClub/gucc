/**
 * Row → page-shape builders shared by the public site and the migration
 * verifier.
 *
 * The existing UI components were written against the JSON files' shapes.
 * Rebuilding those shapes from D1 rows keeps every page, URL and component
 * unchanged, and lets the verifier compare the database's output with the
 * original files field by field. Pure: no database access here.
 *
 * Private columns (phone numbers, legacy_json) are never read by these
 * builders, so they cannot leak into a page payload.
 */

// ───────────────────────────── media ─────────────────────────────

export interface MediaRow {
  id: string;
  storage: "R2" | "STATIC" | "EXTERNAL";
  object_key: string | null;
  legacy_path: string | null;
  external_url: string | null;
  variants_json?: string | null;
  visibility?: string | null;
}

export type Variant = "thumb" | "sm" | "md" | "lg" | "master";

/**
 * Public URL for a media row. R2 objects are served by the /media route,
 * which enforces visibility; STATIC rows keep their original /public path so
 * the site works before (and during) the R2 migration.
 */
export function mediaUrl(m: MediaRow | null | undefined, variant: Variant = "master"): string | undefined {
  if (!m) return undefined;
  if (m.storage === "EXTERNAL") return m.external_url ?? undefined;
  if (m.storage === "STATIC") return m.legacy_path ?? undefined;
  if (!m.object_key) return undefined;
  if (variant !== "master" && m.variants_json) {
    try {
      const variants = JSON.parse(m.variants_json) as Record<string, { key: string }>;
      if (variants[variant]?.key) return `/media/${variants[variant].key}`;
    } catch {
      // fall through to the master
    }
  }
  return `/media/${m.object_key}`;
}

// ───────────────────────────── executives ─────────────────────────────

export interface PublicExecutive {
  position: string;
  name: string;
  studentId?: string;
  designation?: string;
  department?: string;
  campus?: string;
  avatarUrl?: string;
  avatarPosition?: { x: number; y: number };
  avatarScale?: number;
  linkedin?: string;
  github?: string;
  twitter?: string;
  facebook?: string;
  mail?: string;
}

export interface CommitteeRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  layout_json: string | null;
}

export interface MemberRow {
  committee_id: string;
  section: "FACULTY" | "STUDENT";
  unit_type: "CAMPUS" | "WING" | null;
  unit_key: string | null;
  display_order: number;
  position_title: string;
  display_name: string | null;
  designation: string | null;
  campus_label: string | null;
  /** The listing as it appeared in the legacy data (imported listings only). */
  cm_legacy_json?: string | null;
  cm_avatar_x: number | null;
  cm_avatar_y: number | null;
  cm_avatar_scale: number | null;
  full_name: string;
  student_id: string | null;
  department: string | null;
  profile_designation: string | null;
  public_email: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  p_avatar_x: number | null;
  p_avatar_y: number | null;
  p_avatar_scale: number | null;
  /** Media for the term-specific portrait, falling back to the profile's. */
  avatar_storage: MediaRow["storage"] | null;
  avatar_object_key: string | null;
  avatar_legacy_path: string | null;
  avatar_external_url: string | null;
}

export interface CommitteeLayout {
  sections: string[];
  units: Array<{ type: "CAMPUS" | "WING"; key: string; meta?: Record<string, unknown> }>;
}

const LINK_FIELDS = ["linkedin", "github", "twitter", "facebook", "mail"] as const;

/**
 * Links and email as that term listed them. Past committees keep what their imported
 * listing recorded (the original page showed each year's own links); the current
 * committee, and listings created in the admin, follow the live profile.
 */
function termLinks(r: MemberRow, historic: boolean): Partial<Record<(typeof LINK_FIELDS)[number], string>> {
  if (historic && r.cm_legacy_json) {
    try {
      // Exactly what that year's listing had: a year that listed no links shows none.
      const legacy = JSON.parse(r.cm_legacy_json) as Record<string, unknown>;
      const out: Partial<Record<(typeof LINK_FIELDS)[number], string>> = {};
      for (const k of LINK_FIELDS) if (typeof legacy[k] === "string" && legacy[k]) out[k] = legacy[k] as string;
      return out;
    } catch {
      /* fall through to the profile */
    }
  }
  const out: Partial<Record<(typeof LINK_FIELDS)[number], string>> = {};
  if (r.linkedin_url) out.linkedin = r.linkedin_url;
  if (r.github_url) out.github = r.github_url;
  if (r.twitter_url) out.twitter = r.twitter_url;
  if (r.facebook_url) out.facebook = r.facebook_url;
  if (r.public_email) out.mail = r.public_email;
  return out;
}

function toExecutive(r: MemberRow, historic = false): PublicExecutive {
  const e: PublicExecutive = { position: r.position_title, name: r.display_name ?? r.full_name };
  if (r.student_id) e.studentId = r.student_id;
  const designation = r.designation ?? (r.section === "FACULTY" ? r.profile_designation : null);
  if (designation) e.designation = designation;
  if (r.department) e.department = r.department;
  if (r.campus_label) e.campus = r.campus_label;
  const avatar = mediaUrl(
    r.avatar_storage
      ? { id: "", storage: r.avatar_storage, object_key: r.avatar_object_key, legacy_path: r.avatar_legacy_path, external_url: r.avatar_external_url }
      : null,
  );
  if (avatar) e.avatarUrl = avatar;
  const x = r.cm_avatar_x ?? null;
  const y = r.cm_avatar_y ?? null;
  if (x !== null && y !== null) e.avatarPosition = { x, y };
  if (r.cm_avatar_scale !== null && r.cm_avatar_scale !== undefined) e.avatarScale = r.cm_avatar_scale;
  Object.assign(e, termLinks(r, historic));
  return e;
}

export type PublicCommittee = { year: string } & Record<string, unknown>;

/** Rebuild the executives.json entry for one committee from D1 rows. */
export function buildCommittee(c: CommitteeRow, members: MemberRow[]): PublicCommittee {
  const layout: CommitteeLayout = c.layout_json
    ? (JSON.parse(c.layout_json) as CommitteeLayout)
    : { sections: ["facultyMembers", "studentExecutives"], units: [] };
  const mine = members.filter((m) => m.committee_id === c.id).sort((a, b) => a.display_order - b.display_order);
  const historic = c.status !== "CURRENT";
  const list = (section: "FACULTY" | "STUDENT", unitKey: string | null) =>
    mine.filter((m) => m.section === section && (m.unit_key ?? null) === unitKey).map((m) => toExecutive(m, historic));

  const out: PublicCommittee = { year: c.slug };
  const sections = [...layout.sections];
  // Committees created in the admin (no layout yet) get the flat shape.
  if (sections.length === 0) sections.push("facultyMembers", "studentExecutives");
  // Units assigned in the admin but missing from the stored layout are
  // appended (in first-seen order), so nobody silently disappears.
  const units = [...layout.units];
  for (const m of mine) {
    if (!m.unit_key || units.some((u) => u.key === m.unit_key)) continue;
    const type = m.unit_type === "WING" ? "WING" : "CAMPUS";
    units.push({ type, key: m.unit_key, meta: m.campus_label ? { name: m.campus_label } : undefined });
    const section = type === "WING" ? "wings" : "campuses";
    if (!sections.includes(section)) sections.unshift(section);
  }
  layout.units = units;
  // Likewise people listed outside any unit in a committee whose stored layout
  // only has campuses/wings: show them in a flat section instead of dropping them.
  if (mine.some((m) => !m.unit_key && m.section === "FACULTY") && !sections.includes("facultyMembers")) sections.push("facultyMembers");
  if (mine.some((m) => !m.unit_key && m.section === "STUDENT") && !sections.includes("studentExecutives")) sections.push("studentExecutives");
  for (const s of sections) {
    if (s === "facultyMembers") out.facultyMembers = list("FACULTY", null);
    else if (s === "studentExecutives") out.studentExecutives = list("STUDENT", null);
    else if (s === "campuses" || s === "wings") {
      const type = s === "campuses" ? "CAMPUS" : "WING";
      const group: Record<string, unknown> = {};
      for (const u of layout.units.filter((x) => x.type === type)) {
        group[u.key] = { ...(u.meta ?? {}), facultyMembers: list("FACULTY", u.key), studentExecutives: list("STUDENT", u.key) };
      }
      out[s] = group;
    }
  }
  return out;
}

// ───────────────────────────── events ─────────────────────────────

/** The shape of one data/events.json entry, as the events UI expects it. */
export interface PublicEvent {
  sl: number;
  name: string;
  slug: string;
  date: string;
  endDate?: string;
  time?: string;
  location?: string;
  participants?: number | string;
  guest?: string;
  Judge?: string;
  year?: number;
  organizer?: string;
  category?: string;
  link?: string;
  description?: string;
  image: string;
  status: string;
  registrationOpen?: boolean;
  /** An external registration form (Google Forms), when the event uses one. */
  registrationForm?: { url: string; label: string | null };
}

export interface EventRow {
  id: string;
  legacy_sl: number | null;
  slug: string;
  title: string;
  description: string | null;
  category_name: string | null;
  organizer: string | null;
  venue: string | null;
  start_at: string | null;
  end_at: string | null;
  time_text: string | null;
  participants_reported: number | null;
  participants_text: string | null;
  external_link: string | null;
  guests_text: string | null;
  judges_text: string | null;
  status: string;
  registration_enabled: number;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  registration_form_url?: string | null;
  registration_form_label?: string | null;
  banner_storage: MediaRow["storage"] | null;
  banner_object_key: string | null;
  banner_legacy_path: string | null;
  banner_external_url: string | null;
  banner_variants_json: string | null;
}

/** Calendar date in Dhaka (UTC+6) for a stored date or instant. */
const dateOnly = (v: string | null) => {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? v.slice(0, 10) : new Date(t + 6 * 3600_000).toISOString().slice(0, 10);
};

export function buildEvent(r: EventRow, now = new Date()): PublicEvent {
  const date = dateOnly(r.start_at) ?? "";
  const e: PublicEvent = {
    sl: r.legacy_sl ?? 0,
    name: r.title,
    slug: r.slug,
    date,
    image:
      mediaUrl(
        r.banner_storage
          ? { id: "", storage: r.banner_storage, object_key: r.banner_object_key, legacy_path: r.banner_legacy_path, external_url: r.banner_external_url, variants_json: r.banner_variants_json }
          : null,
        "lg",
      ) ?? "/gucc-logo.png",
    status: r.status,
  };
  // The legacy endDate was a bare date; only emit it when the end differs.
  const end = dateOnly(r.end_at);
  if (end && end !== date) e.endDate = end;
  if (r.time_text) e.time = r.time_text;
  if (r.venue) e.location = r.venue;
  if (r.participants_reported !== null) e.participants = r.participants_reported;
  else if (r.participants_text) e.participants = r.participants_text;
  if (r.guests_text) e.guest = r.guests_text;
  if (r.judges_text) e.Judge = r.judges_text;
  if (date) e.year = Number(date.slice(0, 4));
  if (r.organizer) e.organizer = r.organizer;
  if (r.category_name) e.category = r.category_name;
  if (r.external_link) e.link = r.external_link;
  if (r.description) e.description = r.description;
  if (r.registration_form_url) e.registrationForm = { url: r.registration_form_url, label: r.registration_form_label ?? null };
  if (r.registration_enabled) {
    const opens = r.registration_opens_at ? new Date(r.registration_opens_at) : null;
    const closes = r.registration_closes_at ? new Date(r.registration_closes_at) : null;
    e.registrationOpen = (!opens || opens <= now) && (!closes || closes > now) && ["PUBLISHED", "ONGOING"].includes(r.status);
  }
  return e;
}

// ───────────────────────────── contests ─────────────────────────────

export interface PublicContest {
  id: number;
  type: string;
  timestamp: string;
  title: string;
  teams: Array<{ name: string; members: string[]; rank: number | null; solved?: number; achievement?: string }>;
  contestLink: string;
  problemsetLink: string;
  standingsLink: string;
  editorialLink: string;
  practiceLink?: string;
  authors?: string;
  platform?: string;
  images: string[];
  /** The GUCC event that ran this contest, when linked. */
  event?: { slug: string; name: string };
}

export interface ContestRow {
  id: string;
  legacy_id: number;
  type: string;
  title: string;
  held_on_text: string | null;
  host: string | null;
  platform: string | null;
  contest_link: string | null;
  problemset_link: string | null;
  standings_link: string | null;
  editorial_link: string | null;
  practice_link: string | null;
  event_slug?: string | null;
  event_title?: string | null;
}

export interface ContestTeamRow {
  contest_id: string;
  name: string;
  rank: number | null;
  solved: number | null;
  achievement: string | null;
  members_json: string;
  sort_order: number;
}

export function buildContest(c: ContestRow, teams: ContestTeamRow[], images: string[]): PublicContest {
  const out: PublicContest = {
    id: c.legacy_id,
    type: c.type,
    timestamp: c.held_on_text ?? "",
    title: c.title,
    teams: teams
      .filter((t) => t.contest_id === c.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => {
        const team: PublicContest["teams"][number] = { name: t.name, members: JSON.parse(t.members_json) as string[], rank: t.rank };
        if (t.solved !== null) team.solved = t.solved;
        team.achievement = t.achievement ?? "";
        return team;
      }),
    contestLink: c.contest_link ?? "#",
    problemsetLink: c.problemset_link ?? "#",
    standingsLink: c.standings_link ?? "#",
    editorialLink: c.editorial_link ?? "#",
    images,
  };
  if (c.practice_link) out.practiceLink = c.practice_link;
  if (c.host) out.authors = c.host;
  if (c.platform) out.platform = c.platform;
  if (c.event_slug && c.event_title) out.event = { slug: c.event_slug, name: c.event_title };
  return out;
}

/** Display label for a committee unit key: "gucc" → "GUCC", "permanent" → "Permanent". */
export function unitLabel(key: string, name?: string | null): string {
  if (name) return name;
  if (key.length <= 4) return key.toUpperCase();
  return key.split(/[-_ ]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
