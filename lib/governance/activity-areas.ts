/** Areas of the activity log, as leaders filter it (shared by the API and the dashboard). */
export const ACTIVITY_AREAS = ["Members", "Security", "Content", "Events", "Executives", "Governance", "Media", "Recruitment", "Services", "Tasks & meetings"] as const;
export type ActivityArea = (typeof ACTIVITY_AREAS)[number];
