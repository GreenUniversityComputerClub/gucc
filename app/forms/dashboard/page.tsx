import { redirect } from "next/navigation";

/** Forms are managed in the admin now (permission: forms.manage). */
export default function FormsDashboard() {
  redirect("/dashboard/forms");
}
