import { getAvailableYears, getExecutivesByYear, isStudentId, getExecutivesByStudentId } from "@/app/executives/util";
import { notFound } from "next/navigation";
import { 
  CampusTabs,
  AdminPanel,
  ExecutiveProfile
} from "./components";
import executivesData from "../../../data/executives.json";

// Generate static params for all available years and student IDs
export async function generateStaticParams() {
  const years = getAvailableYears();
  const params = years.map((year) => ({
    year: year,
  }));
  
  // Also add student IDs as static params
  const studentIds = new Set<string>();
  
  for (const yearData of executivesData) {
    // Collect student IDs from student executives
    if (yearData.studentExecutives) {
      for (const executive of yearData.studentExecutives) {
        if (executive.studentId && executive.studentId.length === 9) {
          studentIds.add(executive.studentId);
        }
      }
    }
    
    // Collect student IDs from campus-based structure if it exists
    if ('campuses' in yearData) {
      const campuses = yearData.campuses as any;
      for (const campusKey of Object.keys(campuses)) {
        const campus = campuses[campusKey];
        
        if (campus.studentExecutives) {
          for (const executive of campus.studentExecutives) {
            if (executive.studentId && executive.studentId.length === 9) {
              studentIds.add(executive.studentId);
            }
          }
        }
      }
    }
  }
  
  // Add student IDs to params
  const studentIdParams = Array.from(studentIds).map((studentId) => ({
    year: studentId,
  }));
  
  return [...params, ...studentIdParams];
}

export default async function ExecutivesYearPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  
  // Check if the parameter is a 9-digit student ID
  if (isStudentId(year)) {
    const executives = getExecutivesByStudentId(year);
    
    // If no executives found with this student ID, show 404
    if (executives.length === 0) {
      notFound();
    }

    // Show executive profile page
    return <ExecutiveProfile executives={executives} />;
  }
  
  // Otherwise, treat it as a year
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