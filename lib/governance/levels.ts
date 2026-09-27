/**
 * The club's authority order, as leaders read it. Stored as positions.governance_level; the
 * numbers are an implementation detail and never shown outside "Advanced".
 */
export const GOVERNANCE_LEVELS = [
  { value: 100, label: "Moderator" },
  { value: 95, label: "Faculty adviser" },
  { value: 90, label: "President" },
  { value: 80, label: "General Secretary" },
  { value: 70, label: "Vice President / other leadership" },
  { value: 60, label: "Secretary" },
  { value: 50, label: "Coordinator" },
  { value: 30, label: "Other" },
  { value: 20, label: "Executive member" },
] as const;

export const LEVEL_VALUES: readonly number[] = GOVERNANCE_LEVELS.map((l) => l.value);

export function levelLabel(level: number): string {
  return GOVERNANCE_LEVELS.find((l) => l.value === level)?.label ?? GOVERNANCE_LEVELS.reduce((best, l) => (Math.abs(l.value - level) < Math.abs(best.value - level) ? l : best)).label;
}

/** A sensible level for a new position from its category. */
export function defaultLevel(category: string): number {
  return { FACULTY: 95, LEADERSHIP: 70, SECRETARIAT: 60, COORDINATOR: 50, OTHER: 30 }[category] ?? 20;
}
