"use client"

import type { Course } from "../data/courses"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { ChevronsUpDown } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatTeacherName } from "../lib/utils/capitalize"
import {
  getDepartmentCardClass,
  getDepartmentBgColor,
  getCreditIndicatorClass,
  getDepartmentTextColor,
  getBatchFromSectionId,
} from "../lib/utils/department-colors"

interface CourseListProps {
  courses: Course[]
  selectedCourses: Set<string>
  onToggleCourse: (course: Course) => void
  sectionFilters: { [courseCode: string]: string[] }
  onSectionFilter: (courseCode: string, sections: string[]) => void
  selectedBatch?: string | null
}

// Helper function to extract batch number from section ID
const extractSectionBatch = (sectionId: string): string | null => {
  return getBatchFromSectionId(sectionId)
}

// Helper function to perform natural sorting of section IDs
const naturalSortSections = (a: string, b: string): number => {
  // Extract the numeric part after the underscore and D
  const getNumericPart = (str: string) => {
    const match = str.match(/_D(\d+)/)
    return match ? Number.parseInt(match[1], 10) : 0
  }

  // First compare by batch (the part before _)
  const batchA = a.split("_")[0]
  const batchB = b.split("_")[0]

  if (batchA !== batchB) {
    return batchA.localeCompare(batchB)
  }

  // Then compare by section number
  return getNumericPart(a) - getNumericPart(b)
}

export default function CourseList({
  courses,
  selectedCourses,
  onToggleCourse,
  sectionFilters,
  onSectionFilter,
  selectedBatch = null,
}: CourseListProps) {
  // Group sections by teacher for each course
  const getSectionsByTeacher = (course: Course) => {
    const sectionsByTeacher: Record<string, string[]> = {}

    // Filter sections based on batch if needed
    let filteredSections = course.sections
    if (selectedBatch) {
      filteredSections = course.sections.filter((section) => {
        const sectionBatch = extractSectionBatch(section.section)
        return sectionBatch === selectedBatch
      })
    }

    filteredSections.forEach((section) => {
      const teacher = section.teachers?.toLowerCase() || "tba"
      if (!sectionsByTeacher[teacher]) {
        sectionsByTeacher[teacher] = []
      }
      sectionsByTeacher[teacher].push(section.section)
    })

    // Sort the teachers so TBA appears last
    const sortedEntries = Object.entries(sectionsByTeacher).sort(([teacherA], [teacherB]) => {
      if (teacherA === "tba") return 1
      if (teacherB === "tba") return -1
      return teacherA.localeCompare(teacherB)
    })

    // Sort sections for each teacher using natural sort
    const entriesWithSortedSections = sortedEntries.map(([teacher, sections]) => {
      return [teacher, [...sections].sort(naturalSortSections)]
    })

    return Object.fromEntries(entriesWithSortedSections)
  }

  // Check if a course has any sections for the selected batch
  const hasSectionsForBatch = (course: Course, batchNumber: string): boolean => {
    return course.sections.some((section) => {
      const sectionBatch = getBatchFromSectionId(section.section)
      return sectionBatch === batchNumber
    })
  }

  // Filter courses based on whether they have sections for the selected batch
  const filteredCourses = selectedBatch
    ? courses.filter((course) => hasSectionsForBatch(course, selectedBatch))
    : courses

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {filteredCourses.map((course) => {
        const selectedSections = sectionFilters[course.formalCode] || []
        const isSelected = selectedCourses.has(course.formalCode)
        const uniqueKey = `course-${course.formalCode}`
        const sectionsByTeacher = getSectionsByTeacher(course)
        const hasSelectedSections = selectedSections.length > 0

        // Get all available sections for this course
        let availableSections = course.sections
        if (selectedBatch) {
          availableSections = course.sections.filter((section) => {
            const sectionBatch = extractSectionBatch(section.section)
            return sectionBatch === selectedBatch
          })
        }

        // For each teacher, check if all their sections are selected
        const teacherSelectionState: Record<string, boolean | "indeterminate"> = {}
        Object.entries(sectionsByTeacher).forEach(([teacher, sections]) => {
          const selectedCount = sections.filter((section) => selectedSections.includes(section)).length

          if (selectedCount === 0) {
            teacherSelectionState[teacher] = false
          } else if (selectedCount === sections.length) {
            teacherSelectionState[teacher] = true
          } else {
            teacherSelectionState[teacher] = "indeterminate"
          }
        })

        // Count sections by batch
        const batchSections = new Map<string, number>()
        course.sections.forEach((section) => {
          const sectionBatch = extractSectionBatch(section.section)
          if (sectionBatch) {
            batchSections.set(sectionBatch, (batchSections.get(sectionBatch) || 0) + 1)
          }
        })

        // Get department-specific styling
        const deptCardClass = getDepartmentCardClass(course.formalCode)
        const creditIndicatorClass = getCreditIndicatorClass(course.credits)

        return (
          <Card
            key={uniqueKey}
            className={`${isSelected ? "border-primary shadow-md" : ""} overflow-hidden transition-all duration-300 hover:shadow-lg ${getDepartmentBgColor(course.formalCode)}`}
          >
            <CardHeader className={isSelected ? "bg-primary/10 rounded-t-lg" : ""}>
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-4">
                  <CardTitle
                    className={`leading-tight line-clamp-2 min-h-[48px] ${getDepartmentTextColor(course.formalCode)}`}
                    title={course.title}
                  >
                    {course.title}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <Badge variant="default" className="shrink-0">
                        Selected
                      </Badge>
                    )}
                    <div className={`${creditIndicatorClass} credit-indicator`}>{course.credits}</div>
                  </div>
                </div>
                <CardDescription className="font-mono text-muted-foreground/90">{course.formalCode}</CardDescription>
              </div>
              <Separator />
            </CardHeader>
            <CardContent className="space-y-4">
              {batchSections.size > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-muted-foreground">Sections by batch:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Array.from(batchSections.entries()).map(([batch, count]) => (
                      <Badge
                        key={batch}
                        variant={selectedBatch === batch ? "default" : "outline"}
                        className={`text-xs ${selectedBatch === batch ? "" : getDepartmentBgColor(course.formalCode)}`}
                      >
                        {batch}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Select Sections</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                      disabled={!selectedBatch}
                    >
                      {selectedBatch
                        ? selectedSections.length === 0
                          ? "No sections selected"
                          : selectedSections.length === availableSections.length
                            ? "All sections"
                            : `${selectedSections.length} selected`
                        : "Select a batch first"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full max-w-[280px] sm:max-w-none p-0" align="start">
                    <Command>
                      <CommandList>
                        <CommandEmpty>No section found.</CommandEmpty>
                        <CommandGroup>
                          <ScrollArea className="h-[300px]">
                            <CommandItem
                              onSelect={() => {
                                // Toggle all sections
                                const allSections = availableSections.map((s) => s.section).sort(naturalSortSections)
                                if (selectedSections.length === availableSections.length) {
                                  // If all are selected, deselect all
                                  onSectionFilter(course.formalCode, [])
                                } else {
                                  // Otherwise, select all
                                  onSectionFilter(course.formalCode, allSections)
                                }
                              }}
                              className="flex items-center gap-2"
                            >
                              <Checkbox
                                checked={
                                  selectedSections.length === availableSections.length && availableSections.length > 0
                                }
                                id={`select-all-sections-${course.formalCode}`}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    // Select all sections
                                    const allSections = availableSections
                                      .map((s) => s.section)
                                      .sort(naturalSortSections)
                                    onSectionFilter(course.formalCode, allSections)
                                  } else {
                                    // Deselect all sections
                                    onSectionFilter(course.formalCode, [])
                                  }
                                }}
                              />
                              <div className="flex-1 cursor-pointer font-medium">All Sections</div>
                            </CommandItem>

                            <CommandSeparator />

                            {Object.entries(sectionsByTeacher).map(([teacher, sections]) => {
                              const teacherState = teacherSelectionState[teacher]
                              const teacherId = `teacher-${course.formalCode}-${teacher}`

                              return (
                                <div key={teacherId}>
                                  {/* Teacher level selection */}
                                  <CommandItem
                                    onSelect={() => {
                                      // Toggle all sections of this teacher
                                      const allSectionsSelected = sections.every((section) =>
                                        selectedSections.includes(section),
                                      )

                                      let newSelection: string[]

                                      if (allSectionsSelected) {
                                        // If all sections are selected, deselect them all
                                        newSelection = selectedSections.filter((section) => !sections.includes(section))
                                      } else {
                                        // If not all sections are selected, select them all
                                        const filteredSelection = selectedSections.filter(
                                          (section) => !sections.includes(section),
                                        )
                                        newSelection = [...filteredSelection, ...sections]
                                      }

                                      onSectionFilter(course.formalCode, newSelection)
                                    }}
                                    className="flex items-center gap-2 bg-muted/50"
                                  >
                                    <Checkbox
                                      checked={teacherState === true}
                                      id={teacherId}
                                      className={teacherState === "indeterminate" ? "opacity-70" : ""}
                                      onCheckedChange={(checked) => {
                                        let newSelection: string[]

                                        if (checked) {
                                          // Select all sections of this teacher
                                          const filteredSelection = selectedSections.filter(
                                            (section) => !sections.includes(section),
                                          )
                                          newSelection = [...filteredSelection, ...sections]
                                        } else {
                                          // Deselect all sections of this teacher
                                          newSelection = selectedSections.filter(
                                            (section) => !sections.includes(section),
                                          )
                                        }

                                        onSectionFilter(course.formalCode, newSelection)
                                      }}
                                    />
                                    <div className="flex-1 cursor-pointer font-medium">
                                      Teacher: {teacher === "tba" ? "TBA" : formatTeacherName(teacher)}
                                    </div>
                                  </CommandItem>

                                  {/* Individual sections for this teacher */}
                                  {sections.map((section) => {
                                    const sectionInfo = course.sections.find((s) => s.section === section)
                                    if (!sectionInfo) return null

                                    // Extract section batch for display
                                    const sectionBatch = extractSectionBatch(section)

                                    return (
                                      <CommandItem
                                        key={`${course.formalCode}-${section}`}
                                        onSelect={() => {
                                          const newSelection = selectedSections.includes(section)
                                            ? selectedSections.filter((s) => s !== section)
                                            : [...selectedSections, section]
                                          onSectionFilter(course.formalCode, newSelection)
                                        }}
                                        className="flex items-center gap-2 pl-6"
                                      >
                                        <Checkbox
                                          checked={selectedSections.includes(section)}
                                          id={`section-${course.formalCode}-${section}`}
                                          onCheckedChange={(checked) => {
                                            const newSelection = checked
                                              ? [...selectedSections, section]
                                              : selectedSections.filter((s) => s !== section)
                                            onSectionFilter(course.formalCode, newSelection)
                                          }}
                                        />
                                        <div className="flex-1 cursor-pointer">
                                          <div className="flex flex-col">
                                            <span>{section}</span>
                                            <span className="text-xs text-muted-foreground">
                                              {sectionInfo.schedule.map((s) => `${s.day} ${s.time}`).join(", ")}
                                            </span>
                                          </div>
                                        </div>
                                      </CommandItem>
                                    )
                                  })}

                                  <CommandSeparator />
                                </div>
                              )
                            })}
                          </ScrollArea>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <Button
                variant={isSelected ? "destructive" : "default"}
                onClick={() => onToggleCourse(course)}
                className="w-full"
                disabled={!isSelected && (!hasSelectedSections || !selectedBatch)}
              >
                {isSelected ? "Remove Course" : "Add Course"}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
