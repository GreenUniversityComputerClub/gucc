import { redirect } from "next/navigation";
import { requireSignedIn, view } from "@/lib/api/session";
import { PageHeader } from "@/components/admin/ui";
import { PersonAccess, type PersonAccessData } from "@/components/admin/person-access";

/** A person's access. With a profile it lives on the profile's Access tab. */
export default async function PersonAccessPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId: raw } = await params;
  const userId = decodeURIComponent(raw);
  const session = await requireSignedIn(`/dashboard/access/${raw}`);
  const a = await view<PersonAccessData>("access.person", { userId }, `/dashboard/access/${raw}`);
  const self = session.user.id === userId;
  if (a.person.profile_id && !self && (session.caps["executives.assign"] || session.caps["members.manage"])) {
    redirect(`/dashboard/people/${encodeURIComponent(a.person.profile_id)}?tab=access`);
  }
  return (
    <>
      <PageHeader
        back={self ? { href: "/dashboard/profile", label: "Your profile" } : { href: "/dashboard/access", label: "Access" }}
        title={self ? "Your access" : `Access: ${a.person.name ?? a.person.email}`}
        description={self ? "What your account can do and why. Ask the President, General Secretary or a Moderator if you need more for your work." : a.person.email}
      />
      <PersonAccess a={a} session={session} userId={userId} />
    </>
  );
}
