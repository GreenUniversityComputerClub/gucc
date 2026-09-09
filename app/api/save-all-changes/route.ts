import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import executivesData from "@/data/executives.json";

/**
 * Local authoring tool for the avatar-positioning mode (`RESIZE_AVATAR`).
 * It takes no authentication and writes to `data/`, so it is refused outside
 * development: in production the filesystem is read-only and content changes
 * go through git, not through a public POST endpoint.
 */
function devOnlyGuard() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

export async function POST(request: Request) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  try {
    const { year } = await request.json();

    if (!year) {
      return NextResponse.json(
        { error: "Missing required year field" },
        { status: 400 },
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
      { status: 500 },
    );
  }
}
