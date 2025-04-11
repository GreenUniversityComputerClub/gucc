import { getAvailableYears, getExecutivesByYear } from "@/app/executives/util";
import { notFound } from "next/navigation";
import { 
  CampusTabs,
  AdminPanel 
} from "./components";

// Generate static params for all available years
export async function generateStaticParams() {
  const years = getAvailableYears();
  return years.map((year) => ({
    year: year,
  }));
}

export default async function ExecutivesYearPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  const yearData = getExecutivesByYear(year);
  
  // If the requested year doesn't exist, show 404
  if (!yearData) {
    notFound();
  }

  return (
    <div className="container py-4 md:py-8">
      {/* Admin UI is client-side for interactivity */}
      <AdminPanel year={year} />
      {/* All executive and campus UI is client-side for interactivity */}
      <CampusTabs year={year} yearData={yearData} />
    </div>
  );
} 