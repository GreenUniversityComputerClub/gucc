import { getAvailableYears } from "@/app/executives/util";
import { redirect } from "next/navigation";

export default function ExecutivesPage() {
  const availableYears = getAvailableYears().sort(
    (a, b) => Number.parseInt(b) - Number.parseInt(a)
  );
  
  // Redirect to the most recent year
  redirect(`/executives/${availableYears[0]}`);
} 