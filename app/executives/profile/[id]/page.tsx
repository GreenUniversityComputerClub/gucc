import executivesData from "../../../../data/executives.json";
import Certificate from "./certificate";
import { Montserrat, Pinyon_Script } from "next/font/google";
import localFont from "next/font/local";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const pinyon_script = Pinyon_Script({
  subsets: ["latin"],
  weight: ["400"],
});

const engravers_old_english = localFont({
  src: [
    {
      path: "./engravers-old-english.ttf",
      weight: "400",
      style: "normal",
    },
  ],
});

interface Executive {
  position: string;
  name: string;
  studentId?: string;
  [key: string]: any;
}

interface ProcessedExecutive {
  name: string;
  position: string;
  studentId?: string;
}

export default function ProfilePage() {
  // Process executives from years 2023 and 2024
  const processedExecutives: ProcessedExecutive[] = [];
  
  // Create a map to track executives who appear in both years
  const executiveMap = new Map<string, { name: string; positions: string[]; studentId?: string }>();

  // Process 2023 data (only merged)
  const year2023 = executivesData.find((data: any) => data.year === "2023");
  if (year2023?.campuses?.merged?.studentExecutives) {
    year2023.campuses.merged.studentExecutives.forEach((exec: Executive) => {
      if (exec.studentId) {
        const key = exec.studentId;
        const position = `${exec.position}'2023-24`;
        
        if (executiveMap.has(key)) {
          executiveMap.get(key)!.positions.push(position);
        } else {
          executiveMap.set(key, {
            name: exec.name,
            positions: [position],
            studentId: exec.studentId
          });
        }
      }
    });
  }

  // Process 2024 data (GUCC wing only, not VGS)
  const year2024 = executivesData.find((data: any) => data.year === "2024");
  if (year2024?.studentExecutives) {
    year2024.studentExecutives.forEach((exec: Executive) => {
      if (exec.studentId) {
        const key = exec.studentId;
        const position = `${exec.position}'Reformed-2024`;
        
        if (executiveMap.has(key)) {
          executiveMap.get(key)!.positions.push(position);
        } else {
          executiveMap.set(key, {
            name: exec.name,
            positions: [position],
            studentId: exec.studentId
          });
        }
      }
    });
  }

  // Convert map to final array with combined positions
  executiveMap.forEach((value) => {
    let finalPosition: string;
    
    if (value.positions.length === 2) {
      // Extract base role names (before the apostrophe)
      const role1Parts = value.positions[0].split("'");
      const role2Parts = value.positions[1].split("'");
      const baseRole1 = role1Parts[0];
      const baseRole2 = role2Parts[0];
      
      if (baseRole1 === baseRole2) {
        // Same role in both years - use tilde format
        const period1 = role1Parts[1];
        const period2 = role2Parts[1];
        finalPosition = `${baseRole1}'${period1}~${period2}`;
      } else {
        // Different roles - use ampersand separator
        finalPosition = value.positions.join(" & ");
      }
    } else {
      // Single position
      finalPosition = value.positions[0];
    }
    
    processedExecutives.push({
      name: value.name,
      position: finalPosition,
      studentId: value.studentId
    });
  });

  if (processedExecutives.length === 0) {
    return <div>No executives found for the specified criteria</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Executive Certificates</h1>
      <div className="flex flex-col gap-8">
        {processedExecutives.map((executive, index) => (
          <div key={index} className="border rounded-lg p-4 shadow-md">
            <h2 className="text-xl font-semibold mb-2">{executive.name}</h2>
            <p className="text-gray-600 mb-4">{executive.position}</p>
            {executive.studentId && (
              <Certificate
                name={executive.name}
                position={executive.position}
                profileLink={`${"https://gucc.green.edu.bd"}/executives/${executive.studentId}`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
