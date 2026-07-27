import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import executivesData from "@/data/executives.json";

export async function POST(request: Request) {
  try {
    const { studentId, avatarPosition, avatarScale } = await request.json();

    if (!studentId || !avatarPosition || !avatarScale) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Find the executive in the data
    let found = false;
    const updatedData = executivesData.map((yearData) => {
      if (yearData?.studentExecutives) {
        const updatedExecutives = yearData.studentExecutives.map((executive) => {
          if (executive.studentId === studentId) {
            found = true;
            return {
              ...executive,
              avatarPosition,
              avatarScale,
            };
          }
          return executive;
        });

        return {
          ...yearData,
          studentExecutives: updatedExecutives,
        };
      }

      if (yearData?.campuses) {
        const updatedCampuses = Object.fromEntries(
          Object.entries(yearData.campuses as Record<string, any>).map(
            ([campusKey, campus]) => {
              if (!campus?.studentExecutives) {
                return [campusKey, campus];
              }

              const updatedExecutives = campus.studentExecutives.map(
                (executive: any) => {
                  if (executive.studentId === studentId) {
                    found = true;
                    return {
                      ...executive,
                      avatarPosition,
                      avatarScale,
                    };
                  }
                  return executive;
                },
              );

              return [
                campusKey,
                {
                  ...campus,
                  studentExecutives: updatedExecutives,
                },
              ];
            },
          ),
        );

        return {
          ...yearData,
          campuses: updatedCampuses,
        };
      }

      return yearData;
    });

    if (!found) {
      return NextResponse.json(
        { error: "Executive not found" },
        { status: 404 },
      );
    }

    // Write the updated data back to the file
    const filePath = path.join(process.cwd(), "data", "executives.json");
    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving avatar settings:", error);
    return NextResponse.json(
      { error: "Failed to save avatar settings" },
      { status: 500 },
    );
  }
}
