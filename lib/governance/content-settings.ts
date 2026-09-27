/**
 * Shape checks for settings the public pages render directly. A save that doesn't match is
 * refused with a plain message, so a typo in the dashboard can never break the home page or
 * the navbar. Returns the cleaned value (trimmed strings, unknown keys kept).
 */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, what: string, max: number, required = true): string => {
  const t = typeof v === "string" ? v.trim() : "";
  if (required && !t) throw new Error(`${what} is required.`);
  if (t.length > max) throw new Error(`${what} is too long (at most ${max} characters).`);
  return t;
};
/** Site paths ("/…"), uploaded media or https addresses; never javascript: or protocol-relative. */
const link = (v: unknown, what: string, required = true): string => {
  const t = text(v, what, 500, required);
  if (t && !(t.startsWith("/") && !t.startsWith("//")) && !/^https:\/\/[^\s]+$/i.test(t)) throw new Error(`${what} must be a page on this site (starting with /) or an https:// address.`);
  return t;
};
const list = (v: unknown, what: string, max: number): unknown[] => {
  if (!Array.isArray(v)) throw new Error(`${what} must be a list.`);
  if (v.length > max) throw new Error(`${what} can have at most ${max} items.`);
  return v;
};

function person(v: unknown, what: string): Obj {
  if (!isObj(v)) throw new Error(`${what} is missing.`);
  const name = text(v.name, `${what}: name`, 120);
  return {
    ...v,
    name,
    title: text(v.title, `${what}: title`, 160),
    photo: link(v.photo, `${what}: photo`, false),
    initials: text(v.initials, `${what}: initials`, 4, false) || name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join(""),
    message: text(v.message, `${what}: message`, 2000),
  };
}

function section(v: unknown, what: string): Obj {
  if (!isObj(v)) throw new Error(`${what} is missing.`);
  return { ...v, heading: text(v.heading, `${what} heading`, 160), subheading: text(v.subheading, `${what} subheading`, 300, false) };
}

const CHECKS: Record<string, (v: unknown) => unknown> = {
  "page.home": (v) => {
    if (!isObj(v)) throw new Error("Home page content must be an object.");
    const chair = section(v.chairperson, "Chairperson's message");
    const mods = section(v.moderators, "Moderators' messages");
    return {
      ...v,
      chairperson: { ...chair, person: person((v.chairperson as Obj).person, "Chairperson") },
      moderators: { ...mods, people: list((v.moderators as Obj).people, "Moderators", 6).map((p, i) => person(p, `Moderator ${i + 1}`)) },
      stats: list(v.stats, "Figures", 4).map((st, i) => {
        if (!isObj(st)) throw new Error(`Figure ${i + 1} is invalid.`);
        const value = Number(st.value);
        if (!Number.isFinite(value) || value < 0 || value > 10_000_000) throw new Error(`Figure ${i + 1}: enter a number from 0 to 10,000,000.`);
        return { ...st, value: Math.round(value), suffix: text(st.suffix, `Figure ${i + 1}: after`, 3, false), label: text(st.label, `Figure ${i + 1}: label`, 40) };
      }),
    };
  },
  "nav.services": (v) => {
    if (!isObj(v)) throw new Error("The Services menu must be an object.");
    return {
      ...v,
      items: list(v.items, "Services", 10).map((x, i) => {
        if (!isObj(x)) throw new Error(`Service ${i + 1} is invalid.`);
        const href = link(x.href, `Service ${i + 1}: link`);
        if (!href.startsWith("/")) throw new Error(`Service ${i + 1}: link must be a page on this site (starting with /).`);
        return { ...x, label: text(x.label, `Service ${i + 1}: label`, 40), href, description: text(x.description, `Service ${i + 1}: description`, 120, false), visible: x.visible !== false };
      }),
    };
  },
  "page.collaborations": (v) => {
    if (!isObj(v)) throw new Error("Partner clubs must be an object.");
    return {
      ...v,
      partners: list(v.partners, "Partner clubs", 40).map((p, i) => {
        if (!isObj(p)) throw new Error(`Partner ${i + 1} is invalid.`);
        return { ...p, name: text(p.name, `Partner ${i + 1}: name`, 120), image: link(p.image, `Partner ${i + 1}: logo`), description: text(p.description, `Partner ${i + 1}: description`, 300, false) };
      }),
    };
  },
};

/** Throws an Error with a plain message when the value can't be shown on the site. */
export function checkContentSetting(key: string, value: unknown): unknown {
  const check = CHECKS[key];
  return check ? check(value) : value;
}
