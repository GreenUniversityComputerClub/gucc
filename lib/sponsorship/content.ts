/**
 * A sponsorship page's content: the shape the public page (components/sponsorship/sponsorship-view.tsx)
 * renders and the dashboard editor writes. Every list is optional; a section shows only when its
 * list has something. Keys the editor doesn't know are kept as they are.
 */
import { GENERAL_SPONSORSHIP } from "./general";

/** Icons a "why sponsor" card or another opportunity can use (lucide names). */
export const SPONSOR_ICONS = [
  "Users", "Megaphone", "Briefcase", "Share2", "MapPin", "GraduationCap", "Lightbulb", "Mic",
  "Trophy", "Gift", "Shirt", "Utensils", "Server", "Code2", "Laptop", "Shield", "Sparkles", "Building2",
] as const;
export type SponsorIcon = (typeof SPONSOR_ICONS)[number];

/** The three tiers the page styles (and the comparison table's columns). */
export const SPONSOR_TIERS = ["Gold Sponsor", "Silver Sponsor", "Bronze Sponsor"] as const;

export interface SponsorEvent { name?: string; fullName?: string; tagline?: string; organizer?: string; university?: string; website?: string; email?: string }
export interface SponsorProgram {
  id?: string; name?: string; shortName?: string; category?: string; featured?: boolean; description?: string;
  components?: string[]; sponsorValue?: string[]; eventSlug?: string; facts?: { value: string; label: string }[];
}
export interface SponsorPackage { tier: string; slots: number; price: number; currency: string; period?: string; highlight: boolean; benefits: string[] }
/** A row of the comparison table: by tier name (`values`), or the classic gold/silver/bronze columns. */
export interface SponsorComparison { feature: string; gold: boolean; silver: boolean; bronze: boolean; values?: Record<string, boolean> }
export interface SponsorReason { title: string; description: string; icon?: string }
export interface SponsorAchievement { title: string; description: string; eventSlug?: string }
export interface SponsorPartner { name: string; logo: string }
export interface SponsorOpportunity { title: string; detail: string; description: string; icon?: string }
export interface SponsorContact { name: string; role: string; organization: string; phone: string; email: string; website: string }

export interface SponsorshipContent {
  event?: SponsorEvent;
  heroSubtitle?: string;
  typingPhrases?: string[];
  programs?: SponsorProgram[];
  packages?: SponsorPackage[];
  comparisonFeatures?: SponsorComparison[];
  whySponsorReasons?: SponsorReason[];
  achievements?: SponsorAchievement[];
  previousPartners?: SponsorPartner[];
  otherOpportunities?: SponsorOpportunity[];
  contacts?: SponsorContact[];
  [key: string]: unknown;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const blank = (s: unknown) => typeof s !== "string" || !s.trim();

/** One line per thing a reader of the public page would miss, worst first. Empty when it's ready. */
export function contentIssues(c: SponsorshipContent): { level: "error" | "warn"; text: string }[] {
  const out: { level: "error" | "warn"; text: string }[] = [];
  if (blank(c.event?.name) && blank(c.event?.fullName)) out.push({ level: "error", text: "Give the page a name (Hero → Name)." });
  const packages = arr<SponsorPackage>(c.packages);
  if (packages.length === 0) out.push({ level: "warn", text: "No packages: the Packages section is hidden." });
  const tiers = packages.map((p) => p.tier.trim());
  if (new Set(tiers).size !== tiers.length) out.push({ level: "error", text: "Two packages share a tier name. Give each its own." });
  if (packages.some((p) => blank(p.tier))) out.push({ level: "error", text: "A package has no tier name." });
  if (packages.length > 0 && packages.filter((p) => p.highlight).length !== 1) out.push({ level: "warn", text: "Highlight exactly one package (the one you recommend)." });
  if (packages.some((p) => arr(p.benefits).length === 0)) out.push({ level: "warn", text: "A package lists no benefits." });
  const contacts = arr<SponsorContact>(c.contacts);
  if (contacts.length === 0) out.push({ level: "warn", text: "No contacts: \"Contact us\" buttons go to the site's contact form." });
  if (contacts.some((x) => blank(x.phone) && blank(x.email))) out.push({ level: "warn", text: "A contact has neither phone nor email." });
  if (arr(c.programs).length === 0) out.push({ level: "warn", text: "No program: the Programs section is hidden." });
  if (arr<SponsorPartner>(c.previousPartners).some((p) => blank(p.logo))) out.push({ level: "error", text: "A previous partner has no logo." });
  if (arr<SponsorComparison>(c.comparisonFeatures).some((r) => blank(r.feature))) out.push({ level: "warn", text: "A comparison row has no feature name." });
  return out;
}

/** How much a page holds, for the dashboard list. */
export function contentCounts(c: SponsorshipContent) {
  const packages = arr<SponsorPackage>(c.packages);
  const priced = packages.filter((p) => Number(p.price) > 0).map((p) => Number(p.price));
  return {
    packages: packages.length,
    contacts: arr(c.contacts).length,
    partners: arr(c.previousPartners).length,
    sections: ["programs", "packages", "comparisonFeatures", "whySponsorReasons", "achievements", "previousPartners", "otherOpportunities", "contacts"].filter((k) => arr(c[k]).length > 0).length,
    priceFrom: priced.length ? Math.min(...priced) : null,
  };
}

/** Starting points for a new page. */
export const SPONSORSHIP_TEMPLATES = {
  event: {
    label: "An event",
    hint: "One event or contest, with priced packages.",
    title: "",
    content: {
      event: { name: "EVENT NAME 2027", fullName: "Event Name 2027", tagline: "Event Name 2027", organizer: "Green University Computer Club (GUCC)", university: "Green University of Bangladesh", website: "gucc.green.edu.bd", email: "gucc@green.edu.bd" },
      programs: [{
        id: "event-name", name: "Event Name 2027", shortName: "Event Name", category: "Flagship", featured: true,
        description: "What the event is, who takes part and why it matters.",
        components: ["Main Contest (Full name of the main contest)", "Workshops", "Networking", "Awards"],
        sponsorValue: ["Brand exposure across the event", "Direct engagement with participants"],
        eventSlug: "",
      }],
      packages: [
        { tier: "Gold Sponsor", slots: 1, price: 50000, currency: "BDT", highlight: true, benefits: ["Logo on every banner", "Speaking slot at the opening"] },
        { tier: "Silver Sponsor", slots: 2, price: 30000, currency: "BDT", highlight: false, benefits: ["Logo on the main banner"] },
      ],
      contacts: [{ name: "Name", role: "Role", organization: "Green University Computer Club", phone: "+8801XXXXXXXXX", email: "gucc@green.edu.bd", website: "gucc.green.edu.bd" }],
    } as SponsorshipContent,
  },
  partnership: {
    label: "The whole club",
    hint: "A year-round partnership, named after no event.",
    title: "Partner with GUCC",
    content: GENERAL_SPONSORSHIP.content as unknown as SponsorshipContent,
  },
  hackathon: {
    label: "A hackathon",
    hint: "Prizes, judges and a timeline; questions sponsors ask.",
    title: "",
    content: {
      event: { name: "HACKATHON 2027", fullName: "GUCC Hackathon 2027", organizer: "Green University Computer Club (GUCC)", university: "Green University of Bangladesh", website: "gucc.green.edu.bd", email: "gucc@green.edu.bd" },
      heroTitle: "Power the Next Big Idea",
      typingPhrases: ["36 hours of building", "Mentors and judges from industry", "Prizes for the best teams"],
      programs: [{
        id: "hackathon", name: "GUCC Hackathon 2027", shortName: "Hackathon", category: "Flagship", featured: true,
        description: "Teams of students build working products in a weekend, guided by mentors and judged by engineers and founders.",
        components: ["Hackathons", "Workshops", "Networking", "Awards"],
        sponsorValue: ["Your challenge track and API in front of every team", "Meet the strongest builders before they graduate", "Logo on stage, T-shirts and the live stream"],
        facts: [{ value: "300+", label: "Participants" }, { value: "36 h", label: "Of building" }, { value: "20+", label: "Mentors" }, { value: "৳1 lakh+", label: "In prizes" }],
        eventSlug: "",
      }],
      packages: [
        { tier: "Title Sponsor", slots: 1, price: 0, currency: "BDT", highlight: true, benefits: ["Named in the event title", "A challenge track of your own", "Keynote and judging seat"] },
        { tier: "Gold Sponsor", slots: 2, price: 50000, currency: "BDT", highlight: false, benefits: ["Logo on every banner and T-shirt", "Booth at the venue", "Mentors on the floor"] },
        { tier: "Silver Sponsor", slots: 3, price: 25000, currency: "BDT", highlight: false, benefits: ["Logo on banners and the live stream", "Prize named after you"] },
      ],
      sections: [
        { id: "programs", type: "programs", visible: true }, { id: "why", type: "why", visible: true },
        { id: "timeline", type: "timeline", visible: true, data: { items: [{ date: "1 February", title: "Sponsorship deadline" }, { date: "15 February", title: "Registration closes" }, { date: "1–2 March", title: "The hackathon" }] } },
        { id: "packages", type: "packages", visible: true }, { id: "partners", type: "partners", visible: true }, { id: "gallery", type: "gallery", visible: true },
        { id: "faq", type: "faq", visible: true, data: { items: [{ q: "Can we set our own challenge?", a: "Yes: Title and Gold sponsors get a challenge track judged with their engineers." }, { q: "Can our team mentor?", a: "Yes, mentors are welcome for the whole event." }] } },
        { id: "contact", type: "contact", visible: true },
      ],
    } as SponsorshipContent,
  },
  workshops: {
    label: "A workshop series",
    hint: "Several sessions over a semester, with a sponsor per series.",
    title: "",
    content: {
      event: { name: "WORKSHOP SERIES 2027", fullName: "GUCC Workshop Series 2027", organizer: "Green University Computer Club (GUCC)", university: "Green University of Bangladesh", website: "gucc.green.edu.bd", email: "gucc@green.edu.bd" },
      heroTitle: "Teach the Skills You Hire For",
      programs: [{
        id: "workshops", name: "GUCC Workshop Series 2027", shortName: "Workshops", category: "Series", featured: true,
        description: "Hands-on sessions through the semester: web, cloud, AI and competitive programming, led by club members and industry guests.",
        components: ["Workshops", "Industry Sessions", "Tech Talks"],
        sponsorValue: ["Your tools in the hands of hundreds of students", "A session led by your engineers", "Your name on every session and certificate"],
        facts: [{ value: "8", label: "Sessions" }, { value: "400+", label: "Learners" }, { value: "1 semester", label: "Long" }, { value: "Certificates", label: "For everyone" }],
        eventSlug: "",
      }],
      packages: [
        { tier: "Series Sponsor", slots: 1, price: 40000, currency: "BDT", period: "per semester", highlight: true, benefits: ["Named on every session and certificate", "Two sessions led by your team", "Your hiring post to every participant"] },
        { tier: "Session Sponsor", slots: 6, price: 8000, currency: "BDT", period: "per session", highlight: false, benefits: ["One session named after you", "Logo on its banner and slides"] },
      ],
      sections: [
        { id: "programs", type: "programs", visible: true }, { id: "stats", type: "stats", visible: true, data: { items: [{ value: "8", label: "Sessions" }, { value: "400+", label: "Learners" }, { value: "95%", label: "Would recommend" }] } },
        { id: "packages", type: "packages", visible: true }, { id: "why", type: "why", visible: true }, { id: "partners", type: "partners", visible: true }, { id: "contact", type: "contact", visible: true },
      ],
    } as SponsorshipContent,
  },
  blank: {
    label: "Blank",
    hint: "Only a name; add sections yourself.",
    title: "",
    content: { event: { name: "NEW PAGE", fullName: "New sponsorship page", organizer: "Green University Computer Club (GUCC)" } } as SponsorshipContent,
  },
} as const;
export type SponsorshipTemplate = keyof typeof SPONSORSHIP_TEMPLATES;
