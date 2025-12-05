"use client"

import { useEffect, useState } from "react"
import type { Course, SectionWithCourse } from "../data/courses"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ScheduleView from "./schedule-view"
import { formatTeacherName } from "../lib/utils/capitalize"
import { getDepartmentBgColor, getDepartmentTextColor, getCreditIndicatorClass } from "../lib/utils/department-colors"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import CombinationsNavigator from "./combinations-navigator"
import { useMediaQuery } from "../lib/hooks/use-media-query"

interface CombinationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  combinations: SectionWithCourse[][]
  courses: Course[]
  currentIndex: number
  onIndexChange: (index: number) => void
  selectedCombinationIndex: number
  onSelectCombination: (index: number) => void
  className?: string
}

export default function CombinationsDialog({
  open,
  onOpenChange,
  combinations,
  courses,
  currentIndex,
  onIndexChange,
  selectedCombinationIndex,
  onSelectCombination,
  className = "",
}: CombinationsDialogProps) {
  // Use media query to detect mobile screens
  const isMobile = useMediaQuery("(max-width: 640px)")

  // Set initial state based on screen size - expanded for desktop, collapsed for mobile
  const [coursesExpanded, setCoursesExpanded] = useState(!isMobile)

  // Reset to first combination when dialog opens
  useEffect(() => {
    if (open) {
      onIndexChange(0)
    }
  }, [open, onIndexChange])

  // Update coursesExpanded state when screen size changes
  useEffect(() => {
    setCoursesExpanded(!isMobile)
  }, [isMobile])

  // Add keyboard navigation for combinations in the dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return

      if (e.key === "ArrowLeft" && currentIndex > 0) {
        onIndexChange(currentIndex - 1)
      } else if (e.key === "ArrowRight" && currentIndex < combinations.length - 1) {
        onIndexChange(currentIndex + 1)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, combinations.length, currentIndex, onIndexChange])

  if (!combinations || combinations.length === 0) {
    return null
  }

  const currentCombination = combinations[currentIndex] || []
  if (!currentCombination.length) {
    return null
  }

  const selectedCoursesMap = new Map(
    currentCombination.map((section) => {
      const course = courses.find((c) => c.formalCode === section.courseCode)
      const uniqueKey = `${section.courseCode}_${section.section}`
      return [uniqueKey, section]
    }),
  )

  // Toggle the courses section expansion
  const toggleCoursesExpanded = () => {
    setCoursesExpanded(!coursesExpanded)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-[95vw] w-full md:w-[1400px] max-h-[90vh] overflow-hidden flex flex-col ${className}`}
        aria-labelledby="combinations-dialog-title"
      >
        <DialogHeader className="flex flex-col space-y-1.5 text-center sm:text-left">
          <div className="flex items-center justify-between">
            <DialogTitle id="combinations-dialog-title" className="flex items-center gap-4">
              Schedule View
              <span className="text-sm font-normal text-muted-foreground">
                Combination {combinations.length > 0 ? currentIndex + 1 : 0} of {combinations.length}
              </span>
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-6 flex-1 overflow-auto">
          <div className="grid gap-4 lg:grid-cols-[300px,1fr] h-full">
            <div className={`order-2 lg:order-1 border rounded-md ${coursesExpanded ? "" : "h-auto"}`}>
              <div
                className="p-3 border-b flex items-center justify-between cursor-pointer bg-muted/30"
                onClick={toggleCoursesExpanded}
                aria-expanded={coursesExpanded}
                aria-controls="selected-courses-panel"
              >
                <h3 className="font-medium">Selected Courses ({currentCombination.length})</h3>
                <Button variant="ghost" size="sm" className="p-1 h-auto">
                  {coursesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </Button>
              </div>

              {coursesExpanded && (
                <ScrollArea id="selected-courses-panel" className="h-[250px] lg:h-[calc(100vh-300px)]">
                  <div className="space-y-2 p-3">
                    {currentCombination.map((section, index) => {
                      const course = courses.find((c) => c.formalCode === section.courseCode)
                      return (
                        <div
                          key={`combination-${currentIndex}-section-${index}`}
                          className={`text-sm px-3 py-2 ${getDepartmentBgColor(section.courseCode)} rounded-md transition-all duration-300 hover:shadow-sm`}
                        >
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-muted-foreground">{section.courseCode}</span>
                            {course && (
                              <div className={`${getCreditIndicatorClass(course.credits)} credit-indicator`}>
                                {course.credits}
                              </div>
                            )}
                          </div>
                          <div className={`font-medium ${getDepartmentTextColor(section.courseCode)}`}>
                            {course?.title}
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1 text-xs">
                            <span className="text-muted-foreground">Section: {section.section}</span>
                            <span className="text-muted-foreground">
                              Teacher: {formatTeacherName(section.teachers)}
                            </span>
                          </div>
                          <div className="text-xs mt-1 text-muted-foreground">
                            Room: {section.schedule[0]?.room || "TBA"}
                          </div>
                          <div className="text-xs mt-1 text-muted-foreground">
                            Schedule: {section.schedule.map((s) => `${s.day} ${s.time}`).join(", ")}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div className="rounded-lg border bg-card order-1 lg:order-2 overflow-hidden flex-1">
              <div className="h-full overflow-auto">
                <div id="combination-schedule">
                  <ScheduleView selectedCourses={selectedCoursesMap} courses={courses} />
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Add navigation controls for all screen sizes */}
        <div className="mb-4">
          <CombinationsNavigator
            totalCombinations={combinations.length}
            currentIndex={currentIndex}
            onNavigate={onIndexChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
