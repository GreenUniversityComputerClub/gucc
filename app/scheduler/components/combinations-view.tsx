"use client"

import type { Course, SectionWithCourse } from "../data/courses"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { formatTeacherName } from "../lib/utils/capitalize"

interface CombinationsViewProps {
  combinations: SectionWithCourse[][]
  courses: Course[]
  onSelectCombination: (combination: SectionWithCourse[]) => void
  selectedCombinationIndex: number
}

export default function CombinationsView({
  combinations,
  courses,
  onSelectCombination,
  selectedCombinationIndex,
}: CombinationsViewProps) {
  const getCourseForSection = (section: SectionWithCourse): Course | undefined => {
    return courses.find((course) => course.formalCode === section.courseCode)
  }

  return (
    <ScrollArea className="h-[300px] rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Combination</TableHead>
            <TableHead>Sections</TableHead>
            <TableHead className="w-[100px]">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {combinations.map((combination, index) => (
            <TableRow key={`combination-${index}`}>
              <TableCell>#{index + 1}</TableCell>
              <TableCell>
                <div className="space-y-1">
                  {combination.map((section) => {
                    const course = getCourseForSection(section)
                    const uniqueKey = `${section.courseCode}-${section.section}-${index}`
                    return (
                      <div key={uniqueKey} className="text-sm">
                        <span className="font-medium">{course?.title}</span>
                        <span className="text-muted-foreground"> - Section {section.section}</span>
                        <span className="text-muted-foreground">Teacher: {formatTeacherName(section.teachers)}</span>
                      </div>
                    )
                  })}
                </div>
              </TableCell>
              <TableCell>
                <Button
                  variant={selectedCombinationIndex === index ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => onSelectCombination(combination)}
                >
                  {selectedCombinationIndex === index ? "Selected" : "Select"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
