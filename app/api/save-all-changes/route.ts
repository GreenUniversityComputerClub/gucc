import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import executivesData from "@/data/executives.json";

export async function POST(request: Request) {
  try {
    const { year } = await request.json();

    if (!year) {
      return NextResponse.json(
        { error: "Missing required year field" },
        { status: 400 }
      );
    }

    // The current data in memory already has all the changes
    // since the individual executive cards update their state
    // We just need to write the current data back to the file

    // Write the updated data back to the file
    const filePath = path.join(process.cwd(), "data", "executives.json");
    await fs.writeFile(filePath, JSON.stringify(executivesData, null, 2));

    return NextResponse.json({
      success: true,
      message: `All changes for year ${year} saved successfully at ${filePath}`,
    });
  } catch (error) {
    console.error("Error saving all changes:", error);
    return NextResponse.json(
      { error: "Failed to save all changes" },
      { status: 500 }
    );
  }
}
