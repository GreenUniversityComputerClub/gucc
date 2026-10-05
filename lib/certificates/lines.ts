/**
 * One line per person from several committees: someone who served in two committees gets one
 * certificate naming both ("General Secretary, 2023–24 and Reformed 2024"; or "Treasurer,
 * 2023–24 and General Secretary, Reformed 2024" when the positions differ).
 */
export interface ServiceEntry {
  /** The same person across committees (their profile). */
  key: string;
  name: string;
  position: string;
  term: string;
  profileId?: string | null;
  userId?: string | null;
  email?: string | null;
}

export interface MergedLine {
  key: string;
  name: string;
  role: string;
  profileId: string | null;
  userId: string | null;
  email: string | null;
}

const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function mergeServiceLines(entries: ServiceEntry[]): MergedLine[] {
  const people = new Map<string, ServiceEntry[]>();
  for (const e of entries) people.set(e.key, [...(people.get(e.key) ?? []), e]);
  return [...people.values()].map((list) => {
    const first = list[0]!;
    const positions = [...new Set(list.map((e) => e.position))];
    const role = positions.length === 1
      ? `${positions[0]}, ${and([...new Set(list.map((e) => e.term))])}`
      : and(list.map((e) => `${e.position}, ${e.term}`));
    return {
      key: first.key, name: first.name, role,
      profileId: list.find((e) => e.profileId)?.profileId ?? null,
      userId: list.find((e) => e.userId)?.userId ?? null,
      email: list.find((e) => e.email)?.email ?? null,
    };
  });
}
