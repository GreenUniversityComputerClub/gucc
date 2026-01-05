"use client"

import { Button } from "@/components/ui/button"
import { DownloadIcon } from "lucide-react"
import { exportScheduleAsPDF, exportScheduleAsImage } from "../lib/utils/export"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Course, SectionWithCourse } from "../data/courses"

interface ScheduleExportProps {
  scheduleId: string
  selectedCourses: Map<string, SectionWithCourse>
  courses: Course[]
}

// Update the ScheduleExport component to be more responsive
export function ScheduleExport({ scheduleId, selectedCourses, courses }: ScheduleExportProps) {
  const handleExportPDF = async () => {
    try {
      await exportScheduleAsPDF(scheduleId, selectedCourses, courses)
    } catch (error) {
      console.error("Error in PDF export:", error)
      alert("There was an error exporting the PDF. Please try the image export option instead.")
    }
  }

  const handleExportImage = async () => {
    try {
      await exportScheduleAsImage(scheduleId, selectedCourses, courses)
    } catch (error) {
      console.error("Error in image export:", error)
      alert("There was an error exporting the image. Please try again.")
    }
  }

  return (
    <div className="flex items-center justify-between p-2 flex-wrap gap-2">
      <h2 className="text-xl font-semibold">Schedule</h2>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <DownloadIcon size={16} />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
            Export as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportImage} className="cursor-pointer">
            Export as Image
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
