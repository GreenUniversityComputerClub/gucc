import { NextRequest, NextResponse } from "next/server"
import { Readable } from "stream"
import { getFileForDownload } from "@/lib/drive"

interface Params {
  params: Promise<{ fileId: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { fileId } = await params

  try {
    const { stream, name, mimeType } = await getFileForDownload(fileId)
    const webStream = Readable.toWeb(stream as Readable) as unknown as ReadableStream

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "private, max-age=0, no-cache",
      },
    })
  } catch {
    return NextResponse.json({ error: "File not found or inaccessible." }, { status: 404 })
  }
}
