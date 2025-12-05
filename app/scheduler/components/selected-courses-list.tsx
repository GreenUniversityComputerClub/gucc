"use client"

import type { Course } from "../data/courses"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { calculateTotalCredits } from "../lib/utils/combinations"
import { getDepartmentBgColor, getDepartmentTextColor, getCreditIndicatorClass } from "../lib/utils/department-colors"
import { Button } from "@/components/ui/button"

// Update the interface to include onRemoveCourse and onRemoveAll props
interface SelectedCoursesListProps {
  selectedCourses: Set<string>
  sectionFilters: { [courseCode: string]: string[] }
  courses: Course[]
  selectedDays: string[]
  onGenerateCombinations?: () => void
  onRemoveCourse?: (courseCode: string) => void
  onRemoveAll?: () => void
}

// Keep day codes aligned with the dataset and the day selector component
const DAYS = [
  { value: "SAT", label: "Sat" },
  { value: "SUN", label: "Sun" },
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
]

// Update the component to include the new props with default values
export default function SelectedCoursesList({
  selectedCourses,
  sectionFilters,
  courses,
  selectedDays,
  onRemoveCourse = () => {},
  onRemoveAll = () => {},
}: SelectedCoursesListProps) {
  const selectedCoursesList = courses.filter((course) => selectedCourses.has(course.formalCode))
  const totalCredits = calculateTotalCredits(selectedCoursesList)

  return (
    <Card className="white-card shadow-sm" style={{ backgroundColor: "#EAF6EE" }}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="green-title">Selected Courses</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{selectedCourses.size}</Badge>
            {selectedCourses.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onRemoveAll}
              >
                Remove All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Credits</span>
            <div className={`${getCreditIndicatorClass(totalCredits)} credit-indicator`}>{totalCredits}</div>
          </div>
          <Separator />

          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">Selected Sections</span>
            {selectedCourses.size > 0 ? (
              <div className="space-y-3 mt-2">
                {Array.from(selectedCourses).map((courseCode) => {
                  const course = courses.find((c) => c.formalCode === courseCode)
                  if (!course) return null

                  const selectedSectionsList = sectionFilters[courseCode] || []
                  const hasSelectedSections = selectedSectionsList.length > 0

                  // Get department-specific styling
                  const bgColorClass = getDepartmentBgColor(courseCode)
                  const textColorClass = getDepartmentTextColor(courseCode)

                  return (
                    <div
                      key={courseCode}
                      className={`p-3 ${bgColorClass} rounded-md transition-all duration-300 hover:shadow-md relative`}
                    >
                      <div className="absolute top-1 right-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveCourse(courseCode)}
                        >
                          <span className="sr-only">Remove {course.title}</span>
                          <svg
                            xmlns="http://www.w3.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-x"
                          >
                            <path d="M18 6 6 18"></path>
                            <path d="m6 6 12 12"></path>
                          </svg>
                        </Button>
                      </div>
                      <div className={`font-medium ${textColorClass}`}>{course.title}</div>
                      <div className="text-xs text-muted-foreground mb-1 flex justify-between">
                        <span>{courseCode}</span>
                        <span>{course.credits} credits</span>
                      </div>
                      {hasSelectedSections ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {selectedSectionsList.map((section) => (
                            <Badge key={`${courseCode}-${section}`} variant="outline" className="text-xs">
                              {section}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground mt-1">All sections</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-4 text-center border border-dashed rounded-md mt-2">
                <p className="text-sm text-muted-foreground">No courses selected</p>
              </div>
            )}
          </div>
          <Separator />
          <div>
            <span className="text-sm text-muted-foreground">Preferred Days</span>
            {selectedDays.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedDays.map((day) => {
                  const dayInfo = DAYS.find((d) => d.value === day)
                  return (
                    <Badge key={day} variant="secondary">
                      {dayInfo?.label || day}
                    </Badge>
                  )
                })}
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">No preferred days selected</div>
            )}
          </div>
          <Separator />
        </div>
      </CardContent>
    </Card>
  )
}
