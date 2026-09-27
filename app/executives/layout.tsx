import { getAvailableYears, getPrimaryRole, getRolesByStudentId } from "@/app/executives/util";
import { ExecutivesHeader, type ProfileRole } from "./executives-header";

export default async function ExecutivesLayout({ children }: { children: React.ReactNode }) {
  const [years, rolesById] = await Promise.all([getAvailableYears(), getRolesByStudentId()]);
  const profiles: Record<string, ProfileRole> = {};
  for (const [id, roles] of rolesById) {
    const p = getPrimaryRole(roles);
    profiles[id] = { name: p.name, year: p.year };
  }
  return (
    <ExecutivesHeader years={years} profiles={profiles}>
      {children}
    </ExecutivesHeader>
  );
}
