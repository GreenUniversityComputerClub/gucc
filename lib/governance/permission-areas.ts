/**
 * How the dashboard groups permissions for people who manage access. Only presentation: the
 * keys and their meaning live in the database (seeded from lib/governance/catalog.ts).
 */
export const PERMISSION_AREAS: Array<{ area: string; resources: string[] }> = [
  { area: "Members & accounts", resources: ["members", "users", "profile", "accounts"] },
  { area: "Executives & committees", resources: ["executives", "committees", "positions"] },
  { area: "Events", resources: ["events"] },
  { area: "Posts, news & announcements", resources: ["posts"] },
  { area: "Media library", resources: ["media"] },
  { area: "Recruitment", resources: ["recruitment"] },
  { area: "Tasks & meetings", resources: ["tasks", "meetings"] },
  { area: "Messages & notifications", resources: ["messages", "chat", "notifications", "email"] },
  { area: "Services", resources: ["lostfound", "contests", "forms", "certificates"] },
  { area: "Governance", resources: ["roles", "permissions", "rules", "approvals", "settings", "audit", "governance"] },
];

export function areaOf(permissionKey: string): string {
  const resource = permissionKey.split(".")[0];
  return PERMISSION_AREAS.find((a) => a.resources.includes(resource))?.area ?? "Other";
}

export const AREA_ORDER = [...PERMISSION_AREAS.map((a) => a.area), "Other"];

/** Scopes as a person managing access reads them. */
export const SCOPE_LABELS: Record<string, string> = {
  ALL: "Everything",
  OWN: "Only their own",
  ASSIGNED: "Items they're assigned to",
  CATEGORY: "One or more categories",
  COMMITTEE: "One committee",
  POSITION: "People in a position",
  EVENT: "One event",
};

export function describeScope(scope: string, value: string, names: Record<string, string> = {}): string {
  if (scope === "ALL") return "everything";
  if (scope === "OWN") return "their own";
  if (scope === "ASSIGNED" || value === "ASSIGNED") return "items they're assigned to";
  const shown = value.split(",").map((v) => names[v.trim()] ?? v.trim()).filter(Boolean).join(", ");
  return `${(SCOPE_LABELS[scope] ?? scope).toLowerCase()}: ${shown}`;
}
