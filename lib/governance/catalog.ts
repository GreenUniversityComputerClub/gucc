/**
 * Default governance catalog — the seed for a fresh database.
 *
 * Nothing here is consulted at request time. It is rendered once into
 * migrations/0002_governance_seed.sql (see scripts/platform/render-seed.ts),
 * after which every position, grant, rule and policy is data that authorized
 * administrators edit from /admin without touching code.
 *
 * IDs are readable and deterministic ("role:moderator", "pos:president") so
 * the seed is idempotent and migrations can reference rows by id.
 */
import type { ApprovalMode, ApproverSpec, ConditionField, ConditionOperator, RuleEffect, Scope } from "./types";

export interface PermissionDef {
  key: string;
  description: string;
  sensitive?: boolean;
}

const P = (key: string, description: string, sensitive = false): PermissionDef => ({ key, description, sensitive });

export const PERMISSIONS: PermissionDef[] = [
  P("*", "Every permission, present and future (Moderator)", true),

  P("users.read", "View user accounts"),
  P("users.create", "Create or invite user accounts"),
  P("users.update", "Edit user accounts"),
  P("users.suspend", "Suspend or reactivate accounts", true),
  P("users.delete", "Archive user accounts", true),
  P("profile.update", "Edit a member profile"),

  P("members.read", "View members and applications"),
  P("members.approve", "Approve membership applications"),
  P("members.reject", "Reject membership applications"),
  P("members.manage", "Manage membership status"),

  P("executives.read", "View executive assignments"),
  P("executives.assign", "Assign people to committee positions"),
  P("executives.remove", "End or remove committee assignments"),

  P("positions.read", "View positions"),
  P("positions.create", "Create positions"),
  P("positions.update", "Edit positions"),
  P("positions.delete", "Archive positions"),
  P("positions.permissions", "Change the permissions attached to a position", true),

  P("committees.read", "View committees"),
  P("committees.create", "Create committees"),
  P("committees.update", "Edit committees and their status"),
  P("committees.archive", "Archive committees"),

  P("roles.read", "View system roles"),
  P("roles.create", "Create system roles", true),
  P("roles.update", "Edit system roles and their permissions", true),
  P("roles.delete", "Archive system roles", true),
  P("roles.assign", "Grant or revoke system roles", true),
  P("permissions.assign", "Grant permissions directly", true),

  P("rules.read", "View governance rules"),
  P("rules.create", "Create governance rules"),
  P("rules.update", "Edit governance rules"),
  P("rules.delete", "Archive governance rules"),
  P("rules.activate", "Activate or deactivate governance rules"),

  P("approvals.read", "View approval requests"),
  P("approvals.decide", "Approve or reject requests you are eligible for"),
  P("approvals.policies", "Create and edit approval policies", true),

  P("events.read", "View events in the admin, including drafts"),
  P("events.create", "Create events"),
  P("events.update", "Edit events"),
  P("events.delete", "Archive events"),
  P("events.publish", "Publish or unpublish events"),
  P("events.manage_registration", "Manage event registrations"),

  P("posts.read", "View posts in the admin, including drafts"),
  P("posts.create", "Create blog posts, news and announcements"),
  P("posts.update", "Edit posts"),
  P("posts.delete", "Archive posts"),
  P("posts.publish", "Publish or unpublish posts"),
  P("posts.submit", "Submit a post for approval"),
  P("posts.reject", "Reject submitted posts"),

  P("contests.manage", "Manage contest results"),
  P("forms.manage", "Manage external forms"),
  P("certificates.manage", "Manage certificate programs"),
  P("lostfound.moderate", "Moderate lost & found posts"),

  P("media.read", "Browse the media library"),
  P("media.upload", "Upload media"),
  P("media.update", "Edit media details and visibility"),
  P("media.delete", "Archive media", true),

  P("notifications.send", "Send notifications to members"),
  P("audit.read", "Read the audit log", true),
  P("settings.manage", "Manage organization settings"),
  P("settings.system", "Manage protected system settings", true),
  P("governance.protected", "Change protected governance (Moderator authority)", true),
];

/**
 * Added after the first release. Rendered into a separate migration
 * (0004_governance_seed_v2.sql) so the already-applied 0002 never changes.
 */
export const PERMISSIONS_V2: PermissionDef[] = [
  P("recruitment.manage", "Run recruitment campaigns and review applications"),
  P("messages.read", "Read and handle contact-form messages"),
];

export interface GrantV2 {
  role?: string;
  position?: string;
  permission: string;
  scope?: Scope;
  scopeValue?: string;
}

export const GRANTS_V2: GrantV2[] = [
  { position: "president", permission: "recruitment.manage" },
  { position: "president", permission: "messages.read" },
  { position: "general-secretary", permission: "recruitment.manage" },
  { position: "general-secretary", permission: "messages.read" },
  { position: "information-secretary", permission: "messages.read" },
  // Event Coordinators create events and keep editing the ones they created.
  { position: "event-coordinator", permission: "events.create" },
  { position: "event-coordinator", permission: "events.update", scope: "OWN" },
];

/**
 * Defaults withdrawn after the first release (least privilege). The technical
 * administrator no longer approves or manages members by default — that is
 * leadership's job (President, General Secretary, Moderators); governance administrators can
 * still grant it to the role explicitly.
 */
export const REVOKES_V2: GrantV2[] = ["members.approve", "members.reject", "members.manage", "users.create", "users.update", "users.suspend"].map((permission) => ({ role: "administrator", permission }));

/** Roles added after the first release. */
export const ROLES_V2: Array<Omit<RoleDef, "grants"> & { grants: [] }> = [
  { key: "developer", name: "Developer", rank: 20, grants: [],
    description: "Website developers. Holds no permissions by default: governance administrators grant exactly what the work needs." },
];

/** Display names/descriptions updated in v2 (applied only where administrators have not edited the role). */
export const ROLE_RENAMES_V2: Array<{ key: string; name: string; description: string }> = [
  { key: "administrator", name: "Technical Administrator",
    description: "Technical administration: media library, forms, settings and read access for support. Does not approve members or carry Moderator authority unless explicitly granted." },
];

export interface RoleDef {
  key: string;
  name: string;
  description: string;
  rank: number;
  isProtected?: boolean;
  maxHolders?: number;
  grants: GrantDef[];
}

export interface GrantDef {
  permission: string;
  scope?: Scope;
  scopeValue?: string;
}

const G = (permission: string, scope: Scope = "ALL", scopeValue = ""): GrantDef => ({ permission, scope, scopeValue });
const all = (...keys: string[]) => keys.map((k) => G(k));

export const ROLES: RoleDef[] = [
  {
    key: "moderator",
    name: "Moderator",
    description:
      "Highest governance authority. At most three active holders. Only protected rules can restrict this role, and only Moderators can grant it.",
    rank: 1,
    isProtected: true,
    maxHolders: 3,
    grants: [G("*")],
  },
  {
    key: "administrator",
    name: "Administrator",
    description: "Technical administration of accounts, media and settings. Does not carry Moderator authority.",
    rank: 10,
    grants: all(
      "users.read", "users.create", "users.update", "users.suspend",
      "members.read", "members.approve", "members.reject", "members.manage",
      "media.read", "media.upload", "media.update", "media.delete",
      "forms.manage", "lostfound.moderate", "certificates.manage",
      "settings.manage", "audit.read", "roles.read", "rules.read", "approvals.read",
      "positions.read", "committees.read", "executives.read", "events.read", "posts.read",
    ),
  },
  {
    key: "executive",
    name: "Executive",
    description:
      "Held automatically by anyone with an active position in the current committee. Baseline admin access; everything else comes from the position.",
    rank: 50,
    grants: [
      ...all("events.read", "posts.read", "media.read", "executives.read", "committees.read", "positions.read", "members.read", "approvals.read"),
      G("posts.create", "OWN"),
      G("posts.update", "OWN"),
      G("posts.submit", "OWN"),
      G("media.upload", "OWN"),
      G("media.update", "OWN"),
    ],
  },
  {
    key: "member",
    name: "Member",
    description: "An approved club member.",
    rank: 90,
    grants: [G("profile.update", "OWN")],
  },
];

export interface PositionDef {
  key: string;
  name: string;
  category: "FACULTY" | "LEADERSHIP" | "SECRETARIAT" | "COORDINATOR" | "EXECUTIVE" | "OTHER";
  rank: number;
  parent?: string;
  aliases?: string[];
  /** Regex (source) matched against legacy titles, for numbered variants. */
  aliasPattern?: string;
  isProtected?: boolean;
  maxHolders?: number;
  description?: string;
  grants?: GrantDef[];
}

const LEADERSHIP_OPERATIONS: GrantDef[] = all(
  "users.read", "users.update", "users.suspend",
  "members.read", "members.approve", "members.reject", "members.manage",
  "executives.read", "executives.assign", "executives.remove",
  "positions.read", "positions.create", "positions.update",
  "committees.read", "committees.create", "committees.update", "committees.archive",
  "events.read", "events.create", "events.update", "events.delete", "events.publish", "events.manage_registration",
  "posts.read", "posts.create", "posts.update", "posts.delete", "posts.publish", "posts.submit", "posts.reject",
  "media.read", "media.upload", "media.update", "media.delete",
  "contests.manage", "forms.manage", "certificates.manage", "lostfound.moderate",
  "rules.read", "rules.create", "rules.update", "rules.activate",
  "approvals.read", "approvals.decide",
  "notifications.send", "roles.read", "settings.manage",
);

const eventsFor = (categories: string): GrantDef[] => [
  G("events.create", "CATEGORY", categories),
  G("events.update", "CATEGORY", categories),
  G("events.publish", "CATEGORY", categories),
  G("events.manage_registration", "CATEGORY", categories),
];

export const POSITIONS: PositionDef[] = [
  { key: "moderator", name: "Moderator", category: "FACULTY", rank: 1, isProtected: true, description: "Faculty moderator. Governance authority comes from the protected Moderator role." },
  { key: "deputy-moderator", name: "Deputy Moderator", category: "FACULTY", rank: 2, parent: "moderator", aliases: ["Former Deputy Moderator"] },

  { key: "president", name: "President", category: "LEADERSHIP", rank: 10, maxHolders: 1, grants: LEADERSHIP_OPERATIONS },
  { key: "vice-president", name: "Vice-President", category: "LEADERSHIP", rank: 11, parent: "president", aliases: ["Vice President"],
    grants: [G("events.create"), G("events.update"), G("events.manage_registration")] },
  { key: "vice-president-activities", name: "Vice-President (Activities)", category: "LEADERSHIP", rank: 11, parent: "president",
    aliases: ["Vice President (Activities)", "Vice President (Activity)", "Vice-President (Activity)"],
    grants: all("events.create", "events.update", "events.publish", "events.manage_registration") },
  { key: "vice-president-technical", name: "Vice-President (Technical)", category: "LEADERSHIP", rank: 11, parent: "president",
    aliases: ["Vice President (Technical)"],
    grants: [...eventsFor("technical,programming,workshop,contest"), G("posts.update", "CATEGORY", "technical"), G("posts.publish", "CATEGORY", "technical")] },
  { key: "chair", name: "Chair", category: "LEADERSHIP", rank: 12, description: "Chair of a committee unit such as a sub-society. Not the club President." },
  { key: "vice-chair", name: "Vice-Chair", category: "LEADERSHIP", rank: 13, parent: "chair", aliases: ["Vice Chair"] },

  { key: "general-secretary", name: "General Secretary", category: "LEADERSHIP", rank: 20, maxHolders: 1, grants: LEADERSHIP_OPERATIONS },
  { key: "joint-general-secretary", name: "Joint General Secretary", category: "LEADERSHIP", rank: 21, parent: "general-secretary",
    aliases: ["Assistant General Secretary", "Joint General Secretary (Activity)", "Joint General Secretary (Technical)"],
    grants: all("events.create", "events.update", "members.read") },

  { key: "treasurer", name: "Treasurer", category: "SECRETARIAT", rank: 30 },
  { key: "joint-treasurer", name: "Joint Treasurer", category: "SECRETARIAT", rank: 31, parent: "treasurer", aliases: ["Deputy Treasurer"] },
  { key: "organizing-secretary", name: "Organizing Secretary", category: "SECRETARIAT", rank: 32, aliases: ["Organization Secretary"],
    grants: all("events.create", "events.update", "events.manage_registration") },
  { key: "joint-organizing-secretary", name: "Joint Organizing Secretary", category: "SECRETARIAT", rank: 33, parent: "organizing-secretary",
    aliases: ["Deputy Organization Secretary"], grants: all("events.update", "events.manage_registration") },
  { key: "event-coordinator", name: "Event Coordinator", category: "COORDINATOR", rank: 34,
    grants: [G("events.update", "ASSIGNED"), G("events.manage_registration", "ASSIGNED"), G("media.upload", "EVENT", "ASSIGNED")] },
  { key: "programming-secretary", name: "Programming Secretary", category: "SECRETARIAT", rank: 35,
    aliases: ["Programming Secretary (Activity)", "Programming Secretary (Technical)", "Programming and Development Secretary",
      "Programming and Development Secretary (Activity)", "Programming and Development Secretary (Technical)"],
    grants: [...eventsFor("programming,contest,technical"), G("contests.manage"), G("posts.update", "CATEGORY", "technical")] },
  { key: "joint-programming-secretary", name: "Joint Programming Secretary", category: "SECRETARIAT", rank: 36, parent: "programming-secretary",
    aliases: ["Deputy Programming Secretary"], grants: [G("events.update", "CATEGORY", "programming,contest"), G("contests.manage")] },
  { key: "information-secretary", name: "Information Secretary", category: "SECRETARIAT", rank: 37, grants: all("notifications.send") },
  { key: "joint-information-secretary", name: "Joint Information Secretary", category: "SECRETARIAT", rank: 38, parent: "information-secretary",
    aliases: ["Deputy Information Secretary"] },
  { key: "outreach-secretary", name: "Outreach Secretary", category: "SECRETARIAT", rank: 39 },
  { key: "publication-secretary", name: "Publication Secretary", category: "SECRETARIAT", rank: 40, aliases: ["Publication & Publicity Secretary"],
    grants: all("posts.create", "posts.update", "posts.publish", "media.upload") },
  { key: "joint-publication-secretary", name: "Joint Publication Secretary", category: "SECRETARIAT", rank: 41, parent: "publication-secretary",
    aliases: ["Deputy Publication Secretary"], grants: all("posts.create", "posts.update") },
  { key: "cultural-secretary", name: "Cultural Secretary", category: "SECRETARIAT", rank: 42, grants: eventsFor("cultural") },
  { key: "joint-cultural-secretary", name: "Joint Cultural Secretary", category: "SECRETARIAT", rank: 43, parent: "cultural-secretary",
    aliases: ["Deputy Cultural Secretary"], grants: [G("events.update", "CATEGORY", "cultural")] },
  { key: "graphics-multimedia-coordinator", name: "Graphics & Multimedia Coordinator", category: "COORDINATOR", rank: 44,
    aliases: ["Graphics and Multimedia Coordinator", "Graphics and Multimedia Coordinators", "Graphics and Multimedia Coordinators (Lead)",
      "Graphics and Multimedia Secretary"],
    aliasPattern: "^Graphics and Multimedia Coordinators?\\s*-\\s*\\d+$",
    grants: all("media.read", "media.upload", "media.update") },
  { key: "graphics-designer", name: "Graphics Designer", category: "COORDINATOR", rank: 45, parent: "graphics-multimedia-coordinator",
    aliases: ["Graphic Designer", "Assistant Graphics Designer"], grants: all("media.upload") },
  { key: "media-production-coordinator", name: "Media Production Coordinator", category: "COORDINATOR", rank: 46, aliases: ["Photo and Video Editor"],
    grants: all("media.upload") },
  { key: "photography-secretary", name: "Photography Secretary", category: "SECRETARIAT", rank: 47,
    grants: [G("media.upload", "EVENT", "ASSIGNED"), G("media.update", "OWN")] },
  { key: "sports-secretary", name: "Sports Secretary", category: "SECRETARIAT", rank: 48, grants: eventsFor("sports") },
  { key: "joint-sports-secretary", name: "Joint Sports Secretary", category: "SECRETARIAT", rank: 49, parent: "sports-secretary",
    aliases: ["Deputy Sports Secretary"], grants: [G("events.update", "CATEGORY", "sports")] },
  { key: "esports-secretary", name: "E-Sports Secretary", category: "SECRETARIAT", rank: 50, aliases: ["E-Sports Gaming Secretary", "Esports Secretary"],
    grants: eventsFor("esports") },
  { key: "ctf-secretary", name: "CTF Secretary", category: "SECRETARIAT", rank: 51, grants: eventsFor("ctf,security") },
  { key: "red-team-secretary", name: "Red Team Secretary", category: "SECRETARIAT", rank: 52 },
  { key: "blue-team-secretary", name: "Blue Team Secretary", category: "SECRETARIAT", rank: 53 },
  { key: "office-secretary", name: "Office Secretary", category: "SECRETARIAT", rank: 54, aliases: ["Office Secretary & Graphic Designer"] },
  { key: "content-writer", name: "Content Writer", category: "EXECUTIVE", rank: 60, grants: [G("posts.create", "OWN"), G("posts.update", "OWN")] },
  { key: "executive-member", name: "Executive Member", category: "EXECUTIVE", rank: 90, aliasPattern: "^Executive Member\\s*[-–]?\\s*\\d+$" },
];

export interface PolicyDef {
  key: string;
  name: string;
  description: string;
  mode: ApprovalMode;
  threshold?: number;
  approvers: ApproverSpec[];
  isProtected?: boolean;
}

export const APPROVAL_POLICIES: PolicyDef[] = [
  { key: "president-or-gs", name: "President or General Secretary", description: "Either the President or the General Secretary approves.",
    mode: "ANY", approvers: [{ type: "position", value: "president" }, { type: "position", value: "general-secretary" }] },
  { key: "president-and-gs", name: "President and General Secretary", description: "Both the President and the General Secretary approve.",
    mode: "ALL", approvers: [{ type: "position", value: "president" }, { type: "position", value: "general-secretary" }] },
  { key: "any-moderator", name: "Any Moderator", description: "One Moderator approves.", mode: "ANY", approvers: [{ type: "role", value: "moderator" }] },
  { key: "two-moderators", name: "Two Moderators", description: "Two different Moderators approve (2 of 3).",
    mode: "THRESHOLD", threshold: 2, approvers: [{ type: "role", value: "moderator" }] },
  { key: "leadership-any", name: "Club leadership", description: "The President, the General Secretary or a Moderator approves.",
    mode: "ANY", approvers: [{ type: "position", value: "president" }, { type: "position", value: "general-secretary" }, { type: "role", value: "moderator" }] },
  { key: "governance-protected", name: "Protected governance change",
    description: "Changes to Moderator authority, protected rules and protected settings need approval from a second Moderator (the requester cannot approve their own change). With a single Moderator appointed, that Moderator acts alone and the change is audited.",
    mode: "THRESHOLD", threshold: 1, approvers: [{ type: "role", value: "moderator" }], isProtected: true },
];

export interface RuleConditionDef {
  field: ConditionField;
  operator: ConditionOperator;
  value?: unknown;
  group?: number;
}

export interface RuleDef {
  key: string;
  name: string;
  description: string;
  effect: RuleEffect;
  permission: string;
  resourceType?: string;
  scope?: Scope;
  scopeValue?: string;
  priority: number;
  isProtected?: boolean;
  approvalPolicy?: string;
  conditions: RuleConditionDef[];
}

const notModerator: RuleConditionDef = { field: "actor.role", operator: "not_in", value: ["moderator"] };

export const RULES: RuleDef[] = [
  { key: "protected-governance-authority", name: "Protected governance is Moderator-only",
    description: "Only Moderators can change protected governance, whatever roles or positions say.",
    effect: "DENY", permission: "governance.protected", priority: 1000, isProtected: true, conditions: [notModerator] },
  ...["roles.create", "roles.update", "roles.delete", "roles.assign", "permissions.assign", "settings.system", "approvals.policies", "positions.permissions"].map(
    (permission): RuleDef => ({
      key: `protected-${permission.replace(".", "-")}`,
      name: `${permission} is Moderator-only`,
      description: "Protected: prevents privilege escalation through role, permission and policy changes.",
      effect: "DENY",
      permission,
      priority: 1000,
      isProtected: true,
      conditions: [notModerator],
    }),
  ),
  { key: "publication-approval", name: "Publication Approval",
    // Historic wording kept so 0002 stays as it was applied; RULE_TEXT_FIXES_V4 writes the position out.
    description: "Posts published by the Publication Secretary team go to the President or GS first.",
    effect: "REQUIRE_APPROVAL", permission: "posts.publish", resourceType: "post", priority: 200, approvalPolicy: "president-or-gs",
    conditions: [{ field: "actor.position", operator: "in", value: ["publication-secretary", "joint-publication-secretary"] },
      { field: "actor.position", operator: "not_in", value: ["president", "general-secretary"] }] },
  { key: "technical-publishing", name: "Technical Publishing",
    description: "The Programming Secretary may publish posts in the Technical category directly.",
    effect: "ALLOW", permission: "posts.publish", resourceType: "post", priority: 150,
    conditions: [{ field: "actor.position", operator: "eq", value: "programming-secretary" }, { field: "resource.category", operator: "eq", value: "technical" }] },
  { key: "photography-event-media", name: "Photography Event Media Access",
    description: "The Photography Secretary may upload media to events they are assigned to.",
    effect: "ALLOW", permission: "media.upload", resourceType: "event_media", scope: "EVENT", scopeValue: "ASSIGNED", priority: 150,
    conditions: [{ field: "actor.position", operator: "eq", value: "photography-secretary" }] },
  { key: "executive-event-management", name: "Executive Event Management",
    description: "An Event Coordinator may edit events they are assigned to.",
    effect: "ALLOW", permission: "events.update", resourceType: "event", scope: "ASSIGNED", priority: 150,
    conditions: [{ field: "actor.position", operator: "eq", value: "event-coordinator" }] },
];

export interface SettingDef {
  key: string;
  value: unknown;
  description: string;
  isProtected?: boolean;
  isPublic?: boolean;
}

export const SYSTEM_SETTINGS: SettingDef[] = [
  { key: "governance.max_moderators", value: 3, isProtected: true, description: "Maximum number of active Moderators." },
  { key: "governance.protected_change_policy", value: "governance-protected", isProtected: true,
    description: "Approval policy for changes to Moderator authority, protected rules and protected settings." },
  { key: "content.default_approval_policy", value: "leadership-any", description: "Policy used when an author without publish rights submits content." },
  { key: "events.default_approval_policy", value: "leadership-any", description: "Policy used when an organizer without publish rights submits an event." },
  { key: "members.require_approval", value: true, description: "New accounts wait for approval after verifying their email." },
  { key: "auth.session_days", value: 30, isProtected: true, description: "Session lifetime in days." },
  { key: "auth.registration_open", value: true, description: "Whether new accounts can register." },
  { key: "media.max_upload_mb", value: 10, description: "Largest accepted upload, in megabytes." },
  { key: "media.max_dimension", value: 8000, description: "Largest accepted image width or height, in pixels." },
];

// ── v3 (rendered into migrations/0006_governance_seed_v3.sql) ─────────────

export const PERMISSIONS_V3: PermissionDef[] = [
  P("executives.import", "Import executives in bulk (JSON or CSV) and run bulk committee changes"),
  P("users.reset_password", "Issue a one-time password reset link for another account (when email is unavailable)", true),
];

export const GRANTS_V3: GrantV2[] = [
  { position: "president", permission: "executives.import" },
  { position: "general-secretary", permission: "executives.import" },
  { position: "president", permission: "users.reset_password" },
  { position: "general-secretary", permission: "users.reset_password" },
];

/**
 * Positions of the 2026 structure that earlier releases folded into a broader
 * position as an alternative title. As their own positions they can carry
 * different permissions; each starts with the grants of the position it was
 * split from (`from`), and existing assignments with these exact titles move
 * over. Display titles never change.
 */
export interface SplitPositionDef extends PositionDef {
  from: string;
}

export const POSITIONS_V3: SplitPositionDef[] = [
  { key: "former-deputy-moderator", name: "Former Deputy Moderator", category: "FACULTY", rank: 3, parent: "moderator", from: "deputy-moderator" },
  { key: "joint-general-secretary-activity", name: "Joint General Secretary (Activity)", category: "LEADERSHIP", rank: 21, parent: "general-secretary",
    from: "joint-general-secretary" },
  { key: "joint-general-secretary-technical", name: "Joint General Secretary (Technical)", category: "LEADERSHIP", rank: 21, parent: "general-secretary",
    from: "joint-general-secretary" },
  { key: "programming-secretary-activity", name: "Programming Secretary (Activity)", category: "SECRETARIAT", rank: 35, from: "programming-secretary",
    aliases: ["Programming and Development Secretary (Activity)"] },
  { key: "programming-secretary-technical", name: "Programming Secretary (Technical)", category: "SECRETARIAT", rank: 35, from: "programming-secretary",
    aliases: ["Programming and Development Secretary (Technical)"] },
  { key: "graphics-multimedia-coordinator-lead", name: "Graphics & Multimedia Coordinator (Lead)", category: "COORDINATOR", rank: 44,
    from: "graphics-multimedia-coordinator", aliases: ["Graphics and Multimedia Coordinators (Lead)", "Graphics and Multimedia Coordinator (Lead)"] },
];

/** Titles each split position takes over from the position it came from. */
export const splitTitles = (p: SplitPositionDef): string[] => [p.name, ...(p.aliases ?? [])];

/**
 * The positions a fresh database ends up with after every seed migration:
 * the v1 catalog minus the titles that moved, plus the v3 positions. The legacy
 * import maps titles against this list.
 */
export const CURRENT_POSITIONS: PositionDef[] = [
  ...POSITIONS.map((p) => {
    const moved = POSITIONS_V3.filter((n) => n.from === p.key).flatMap(splitTitles).map((t) => t.toLowerCase());
    return moved.length ? { ...p, aliases: (p.aliases ?? []).filter((a) => !moved.includes(a.toLowerCase())) } : p;
  }),
  ...POSITIONS_V3.map(({ from: _from, ...p }) => p),
];

// ── v4 (rendered into migrations/0008_governance_seed_v4.sql) ─────────────

export const PERMISSIONS_V4: PermissionDef[] = [
  P("chat.send", "Send direct messages to other members"),
  P("chat.moderate", "Review reported messages and lost & found posts (never other conversations)", true),
  P("tasks.assign", "Create tasks and assign them to members, or to an email address"),
  P("tasks.manage", "Edit, reassign or cancel anyone's tasks"),
  P("meetings.schedule", "Schedule meetings and invite members"),
  P("meetings.manage", "Edit or cancel anyone's meetings"),
  P("system.health", "View system health: usage against the free limits, recent errors and email delivery"),
];

/**
 * Round 9. The chat group permissions were added by migration 0011; the rest by 0017. Declared
 * here too, so session capabilities and the access screens know them. Moderators hold every
 * permission, and the President and the General Secretary hold the Moderator role while in office.
 */
export const PERMISSIONS_V5: PermissionDef[] = [
  P("chat.groups.create", "Create group conversations with other members"),
  P("chat.groups.manage", "Rename any group conversation and change its photo and description"),
  P("accounts.manage", "Delete members' accounts (their personal data is erased; committee history stays)", true),
  P("accounts.email", "Change a member's sign-in email", true),
  P("email.campaigns", "Email announcements to members (uses the club's monthly email allowance)"),
];

/** Governance powers the President and General Secretary now use day to day. */
export const LEADERSHIP_GOVERNANCE_V4 = ["roles.create", "roles.update", "roles.delete", "roles.assign", "permissions.assign", "positions.permissions", "positions.delete"] as const;

export const GRANTS_V4: GrantV2[] = [
  // The President and General Secretary create roles and positions and grant permissions. The
  // invariants still apply: only what they hold club-wide, never protected powers, and sensitive
  // permissions they grant wait for a Moderator's approval (policy "sensitive-grant").
  ...["president", "general-secretary"].flatMap((position) =>
    [...LEADERSHIP_GOVERNANCE_V4, "audit.read", "chat.moderate", "tasks.manage", "meetings.manage", "system.health"].map((permission) => ({ position, permission })),
  ),
  // Developers see the activity log and system health. audit.read is sensitive, so developers
  // must use two-factor sign-in, and a President or General Secretary granting the role needs a
  // Moderator's approval.
  { role: "developer", permission: "system.health" },
  { role: "developer", permission: "audit.read" },
  // Executives hand out work and call meetings; people only ever see their own tasks and the
  // meetings they're invited to.
  { role: "executive", permission: "tasks.assign" },
  { role: "executive", permission: "meetings.schedule" },
  // Every executive can post events and blog posts of their own; leaders approve them or trust
  // the author (a direct posts.publish / events.publish grant) to publish without approval.
  { role: "executive", permission: "events.create", scope: "OWN" },
  { role: "executive", permission: "events.update", scope: "OWN" },
  { role: "member", permission: "chat.send" },
  { role: "executive", permission: "chat.send" },
];

/** Protected DENY rules whose governance powers the President and General Secretary now share. */
export const PROTECTED_RULES_OPENED_V4 = LEADERSHIP_GOVERNANCE_V4.filter((p) => p !== "positions.delete");

export const POLICIES_V4: PolicyDef[] = [
  { key: "sensitive-grant", name: "Sensitive permission grant",
    description: "A Moderator approves sensitive permissions granted by the President or the General Secretary.",
    mode: "ANY", approvers: [{ type: "role", value: "moderator" }], isProtected: true },
];

/** Wording fixes for seeded rules still untouched by anyone (position names are always written out). */
export const RULE_TEXT_FIXES_V4: Array<{ key: string; description: string }> = [
  { key: "publication-approval", description: "Posts published by the Publication Secretary team go to the President or the General Secretary first." },
];

/** Ready-made rules, seeded inactive: leaders switch them on in the dashboard. */
export const RULE_TEMPLATES_V4: RuleDef[] = [
  { key: "executives-publish-own-posts", name: "Executives publish their own posts directly",
    description: "Posts written by any executive go live without approval. Switch off to review every post.",
    effect: "ALLOW", permission: "posts.publish", resourceType: "post", scope: "OWN", priority: 120,
    conditions: [{ field: "actor.role", operator: "in", value: ["executive"] }] },
  { key: "executives-publish-own-events", name: "Executives publish their own events directly",
    description: "Events created by any executive go live without approval. Switch off to review every event.",
    effect: "ALLOW", permission: "events.publish", resourceType: "event", scope: "OWN", priority: 120,
    conditions: [{ field: "actor.role", operator: "in", value: ["executive"] }] },
];

/**
 * Held automatically by people listed in an affiliated committee of the current term (e.g.
 * CSS) and in no GUCC position. They have an account and may write their own posts and events;
 * publishing waits for the President or the General Secretary (content.affiliate_approval_policy).
 */
export const ROLES_V4: RoleDef[] = [
  {
    key: "unit-executive",
    name: "Affiliated committee executive",
    description: "Automatic for executives of an affiliated committee (e.g. CSS): their own posts and events, published after the President or General Secretary approves. No club management.",
    rank: 60,
    grants: [
      G("posts.read", "OWN"), G("posts.create", "OWN"), G("posts.update", "OWN"), G("posts.submit", "OWN"),
      G("events.read", "OWN"), G("events.create", "OWN"), G("events.update", "OWN"),
      G("media.upload", "OWN"), G("media.update", "OWN"),
      G("chat.send"), G("profile.update", "OWN"),
    ],
  },
];

export const SYSTEM_SETTINGS_V4: SettingDef[] = [
  { key: "governance.governing_units", value: ["gucc"], isProtected: true,
    description: "Units of the current committee whose positions carry club authority. People in other units (e.g. CSS) get the affiliated committee baseline only." },
  { key: "content.affiliate_approval_policy", value: "president-or-gs",
    description: "Policy for posts and events submitted by affiliated committee executives (e.g. CSS)." },
  { key: "governance.sensitive_grant_policy", value: "sensitive-grant", isProtected: true,
    description: "Approval policy for sensitive permissions granted by anyone who is not a Moderator." },
  { key: "security.mfa_required_for_sensitive", value: true, isProtected: true,
    description: "Accounts holding sensitive permissions must use two-factor sign-in." },
  { key: "security.mfa_grace_days", value: 7, description: "Days an account with sensitive permissions may sign in before two-factor becomes mandatory." },
  { key: "security.session_idle_days", value: 14, description: "Sign out after this many days without activity." },
  { key: "security.session_idle_hours_sensitive", value: 12, description: "Sign out accounts with sensitive permissions after this many hours without activity." },
  { key: "security.session_max_days", value: 30, description: "Sign in again after this many days, whatever the activity." },
  { key: "security.reauth_minutes", value: 10, description: "How long a password or two-factor confirmation covers sensitive actions." },
  { key: "notifications.retention_days", value: 180, description: "Read notifications older than this are deleted." },
  // Free-tier protection (R2 is the only Cloudflare service billed past its free amount).
  { key: "media.uploads_enabled", value: true, isProtected: true, description: "Uploads are accepted. Switched off automatically near the free storage or write limit; a Moderator switches it back on." },
  { key: "media.storage_limit_bytes", value: 8 * 1024 ** 3, isProtected: true, description: "Uploads stop when stored files reach this size (R2 includes 10 GB free)." },
  { key: "media.daily_object_writes", value: 2000, isProtected: true, description: "Files written to storage per day, all uploads together (R2 includes 1 million writes a month free)." },
  { key: "media.daily_anonymous_files", value: 300, description: "Files recruitment applicants may upload per day, all together." },
  { key: "assistant.daily_limit", value: 300, description: "AI answers per day; after that the assistant answers from the club's own data." },
  // As released in 0008. Email moved to SMTP2GO in 0009_platform_v5.sql, which rewrites these
  // descriptions, lowers the daily default to 40 and adds email.monthly_limit (1,000).
  { key: "email.enabled", value: false, isProtected: true, description: "Send email through Resend. Turn on only after a successful test email from System health." },
  { key: "email.daily_limit", value: 90, description: "Emails per day (the Resend free plan allows 100)." },
  { key: "usage.alert_percent", value: 70, description: "Warn Moderators when Cloudflare usage passes this share of a free limit." },
  { key: "usage.pause_percent", value: 90, isProtected: true, description: "Pause uploads when R2 storage or writes pass this share of the free limit." },
];
