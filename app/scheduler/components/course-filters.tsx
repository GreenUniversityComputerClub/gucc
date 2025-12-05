"use client"
import type { Course } from "../data/courses"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { FeatureTooltip } from "./feature-tooltip"

interface CourseFiltersProps {
  courses: Course[]
  onFilterChange: (department: string | null, batch: string | null) => void
  selectedDepartment: string | null
  selectedBatch: string | null
}

export function CourseFilters({ courses, onFilterChange, selectedDepartment, selectedBatch }: CourseFiltersProps) {
  // Extract unique departments from courses
  const departments = Array.from(
    new Set(
      courses.map((course) => {
        // Extract department from program field (e.g., "CSE(Regular)" -> "CSE")
        const match = course.program.match(/^([A-Z]+)/)
        return match ? match[1] : course.program
      }),
    ),
  ).sort()

  // Extract unique batches from courses
  const batches = Array.from(
    new Set(
      courses
        .map((course) => {
          // Extract batch number (e.g., "2025, Spring - 251" -> "251")
          const match = course.batch.match(/(\d+)$/)
          return match ? match[1] : null
        })
        .filter(Boolean), // Remove null values
    ),
  ).sort((a, b) => Number(b) - Number(a)) // Sort in descending order

  // Get batches for the selected department
  const departmentBatches = selectedDepartment
    ? Array.from(
        new Set(
          courses
            .filter((course) => {
              const deptMatch = course.program.match(/^([A-Z]+)/)
              const courseDept = deptMatch ? deptMatch[1] : course.program
              return courseDept === selectedDepartment
            })
            .map((course) => {
              const match = course.batch.match(/(\d+)$/)
              return match ? match[1] : null
            })
            .filter(Boolean),
        ),
      ).sort((a, b) => Number(b) - Number(a))
    : []

  // Reset all filters
  const resetFilters = () => {
    onFilterChange(null, null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-sm">Department</span>
            <FeatureTooltip content="Select your department (e.g., CSE, EEE) to filter available courses" />
          </div>
          <Select
            value={selectedDepartment || ""}
            onValueChange={(value) => {
              onFilterChange(value || null, null) // Reset batch when department changes
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-sm">Batch</span>
            <FeatureTooltip content="Select your batch number to see courses specific to your semester" />
          </div>
          <Select
            value={selectedBatch || ""}
            onValueChange={(value) => onFilterChange(selectedDepartment, value || null)}
            disabled={!selectedDepartment}
          >
            <SelectTrigger>
              <SelectValue placeholder={selectedDepartment ? "Select batch" : "Select department first"} />
            </SelectTrigger>
            <SelectContent>
              {departmentBatches.map((batch) => (
                <SelectItem key={batch} value={batch}>
                  Batch {batch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedDepartment && (
        <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Please select a department to view courses</AlertDescription>
        </Alert>
      )}

      {selectedDepartment && !selectedBatch && (
        <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Please select a batch to view courses</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
