import { redirect } from "next/navigation";
import { getRecruitment } from "@/lib/public/data";
import { JoinClient } from "./join-client";

// Recruitment status comes from the database (refreshed every few minutes and when admins save).
export const revalidate = 300;

/** While a recruitment is open, "Join Us" leads to the application form, as it always did. */
export default async function JoinPage() {
  const { open } = await getRecruitment();
  if (open) redirect("/recruitment");
  return <JoinClient />;
}
