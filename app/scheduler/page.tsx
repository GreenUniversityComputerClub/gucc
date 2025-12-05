"use client"

import { useState, useCallback } from "react"
import { type Course, type SectionWithCourse, getCoursesArray } from "./data/courses"
import { generateCombinations } from "./lib/utils/combinations"
import CourseSearch from "./components/course-search"
import CourseList from "./components/course-list"
import CombinationsDialog from "./components/combinations-dialog"
import NoCombinationsDialog from "./components/no-combinations-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import React from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { generateAcronym } from "./lib/utils/acronym"
import { DaySelector } from "./components/day-selector"
import { InfoIcon } from "lucide-react"
import SelectedCoursesList from "./components/selected-courses-list"
import ContributorSection from "./components/contributor-section"

interface SectionFilters {
  [courseCode: string]: string[]
}

import { courses } from "./data/courses"
const coursesArray = getCoursesArray(courses)

export default function Page() {
  const [filteredCourses, setFilteredCourses] = useState<Course[]>(coursesArray)
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set())
  const [combinations, setCombinations] = useState<SectionWithCourse[][]>([])
  const [currentCombinationIndex, setCurrentCombinationIndex] = useState<number>(0)
  const [showCombinations, setShowCombinations] = useState(false)
  const [showNoCombinationsError, setShowNoCombinationsError] = useState(false)
  const [sectionFilters, setSectionFilters] = useState<SectionFilters>({})
  const [selectedCombinationIndex, setSelectedCombinationIndex] = useState<number>(-1)
  const [maxDays, setMaxDays] = useState<number>(3)
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTourGeneratingCombinations, setIsTourGeneratingCombinations] = useState(false)

  // Update the Page component to handle example data loading/clearing
  // First, add a state to track whether to show the example data button

  // Ref to track if combinations have been generated during the tour
  const combinationsGeneratedDuringTour = React.useRef(false)

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showCombinations || combinations.length === 0) return

      if (e.key === "ArrowLeft" && currentCombinationIndex > 0) {
        setCurrentCombinationIndex(currentCombinationIndex - 1)
      } else if (e.key === "ArrowRight" && currentCombinationIndex < combinations.length - 1) {
        setCurrentCombinationIndex(currentCombinationIndex + 1)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showCombinations, combinations.length, currentCombinationIndex])

  // Apply all filters (search, department)
  const applyFilters = useCallback(() => {
    let filtered = coursesArray

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (course) =>
          course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          course.formalCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
          generateAcronym(course.title).toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    // Apply batch filter only if a batch is selected
    if (selectedBatch) {
      filtered = filtered.filter((course) => {
        // Check if the course's batch field matches the selected batch
        const batchMatch = course.batch.match(/(\d+)$/)
        const courseBatch = batchMatch ? batchMatch[1] : null

        // If the course's batch matches, include it
        if (courseBatch === selectedBatch) {
          return true
        }

        // Otherwise, check if any section is offered to the selected batch
        return course.sections.some((section) => {
          const sectionId = section.section
          // Extract batch from section ID (e.g., "251_D1" -> "251")
          const sectionBatchMatch = sectionId.match(/^(\d+)/)
          const sectionBatch = sectionBatchMatch ? sectionBatchMatch[1] : null
          return sectionBatch === selectedBatch
        })
      })
    }

    setFilteredCourses(filtered)
  }, [searchTerm, selectedBatch])

  // Apply filters when any filter changes
  React.useEffect(() => {
    applyFilters()
  }, [searchTerm, selectedBatch, applyFilters])

  // Update the handleSearch function to reset batch when searching
  const handleSearch = (searchTerm: string) => {
    // Update the handleSearch function to actually set the searchTerm state
    setSearchTerm(searchTerm)
  }

  const handleFilterChange = (batch: string | null) => {
    setSelectedBatch(batch)
  }

  const handleToggleCourse = (course: Course) => {
    const newSelected = new Set(selectedCourses)
    if (newSelected.has(course.formalCode)) {
      newSelected.delete(course.formalCode)
      const newSectionFilters = { ...sectionFilters }
      delete newSectionFilters[course.formalCode]
      setSectionFilters(newSectionFilters)
    } else {
      newSelected.add(course.formalCode)
      // Don't automatically select all sections - user must choose
    }
    setSelectedCourses(newSelected)
    setCombinations([])
    setCurrentCombinationIndex(0)
    setShowCombinations(false)
    combinationsGeneratedDuringTour.current = false
  }

  // Update the handleGenerateCombinations function to show loading state
  const handleGenerateCombinations = (skipLoading = false) => {
    if (!skipLoading) {
      setIsLoading(true)
    }

    // Use setTimeout to allow the loading dialog to render before starting the computation
    setTimeout(() => {
      try {
        const selectedCoursesList = coursesArray.filter((course) => selectedCourses.has(course.formalCode))
        console.log("Selected courses:", selectedCoursesList)

        const coursesWithFilteredSections = selectedCoursesList.map((course) => {
          const selectedSections = sectionFilters[course.formalCode] || []

          let filteredSections = course.sections

          // Apply section filter if any
          if (selectedSections.length > 0) {
            filteredSections = filteredSections.filter((section) => selectedSections.includes(section.section))
          }

          return {
            ...course,
            sections: filteredSections,
          }
        })

        console.log("Filtered courses:", coursesWithFilteredSections)

        // You can optionally add a seed for reproducible results
        const seed = Date.now() // Use current timestamp as seed
        const newCombinations = generateCombinations(coursesWithFilteredSections, maxDays, selectedDays, { seed })

        console.log("Generated combinations:", newCombinations)

        const validCombinations = newCombinations.filter(
          (combination) => combination.length === selectedCoursesList.length,
        )
        console.log("Valid combinations:", validCombinations)

        setCombinations(validCombinations)
        setCurrentCombinationIndex(0)

        // Mark that combinations have been generated during the tour
        combinationsGeneratedDuringTour.current = true

        // Only show combinations dialog if not skipping loading (i.e., not called from tour)
        if (!skipLoading) {
          setShowCombinations(validCombinations.length > 0)
        }

        if (validCombinations.length === 0 && selectedCoursesList.length > 0) {
          setShowNoCombinationsError(true)
        }
      } finally {
        if (!skipLoading) {
          setIsLoading(false)
        }
        setIsTourGeneratingCombinations(false)
      }
    }, 100)
  }

  // Function to handle generating combinations during the tour
  const handleTourGenerateCombinations = () => {
    if (!combinationsGeneratedDuringTour.current) {
      setIsTourGeneratingCombinations(true)
      handleGenerateCombinations(true)
    }
  }

  // Get relationship explanation text
  const getRelationshipExplanation = () => {
    if (selectedDays.length === 0) {
      return `Schedules will use exactly ${maxDays} days.`
    }

    if (selectedDays.length >= maxDays) {
      return `Schedules will use exactly ${maxDays} days, prioritizing your preferred days.`
    } else {
      return `Schedules will use ${selectedDays.length} preferred days plus ${maxDays - selectedDays.length} additional days to reach exactly ${maxDays} days.`
    }
  }

  // Add a natural sort function to the page component
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

  // Modify the handleSectionFilter function to sort sections naturally
  const handleSectionFilter = (courseCode: string, sections: string[]) => {
    setSectionFilters((prevFilters) => ({
      ...prevFilters,
      [courseCode]: [...sections].sort(naturalSortSections),
    }))
  }

  // Update the loadExampleData function to handle both tour and manual loading
  const loadExampleData = (data: {
    batch: string
    selectedCourses: string[]
    sectionFilters: Record<string, string[]>
    maxDays: number
    selectedDays: string[]
  }) => {
    // Use a single batch of state updates to prevent multiple re-renders
    const batchedUpdates = () => {
      setSelectedBatch(data.batch)
      setSelectedCourses(new Set(data.selectedCourses))
      setSectionFilters(data.sectionFilters)
      setMaxDays(data.maxDays)
      setSelectedDays(data.selectedDays)

      // Reset combinations when loading example data
      setCombinations([])
      setCurrentCombinationIndex(0)
      combinationsGeneratedDuringTour.current = false
    }

    // Execute the batched updates in the next tick to avoid render loops
    setTimeout(batchedUpdates, 0)
  }

  // Add a function to clear example data
  const clearExampleData = () => {
    // Reset to empty state
    setSelectedBatch(null)
    setSelectedCourses(new Set())
    setSectionFilters({})
    setMaxDays(3)
    setSelectedDays([])
    setCombinations([])
    setCurrentCombinationIndex(0)
    combinationsGeneratedDuringTour.current = false
  }

  // Add a function to handle showing/hiding the combinations dialog
  const handleShowCombinationsDialog = (show: boolean) => {
    // Prevent showing the dialog if it's already shown
    if (show && showCombinations) return

    // Prevent hiding the dialog if it's already hidden
    if (!show && !showCombinations) return

    // If showing the dialog, generate combinations first if needed
    if (show && combinations.length === 0 && selectedCourses.size > 0 && !isTourGeneratingCombinations) {
      handleTourGenerateCombinations()
    }

    // Then show or hide the dialog
    setShowCombinations(show)
  }

  return (
    <div className="min-h-screen green-university-bg">
      <main className="py-8 space-y-4">
        <p className="text-lg green-subtitle">Find optimal class combinations with conflict-free schedules</p>
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
            <Card className="white-card" data-tour="search-filters">
              <CardHeader>
                <CardTitle className="green-title">Search Courses</CardTitle>
              </CardHeader>  
              <CardContent className="space-y-4">
                <CourseSearch onSearch={handleSearch} />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="schedule-preferences">
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <label className="text-sm font-medium green-title">Batch</label>
                    </div>
                    <Select
                      value={selectedBatch || ""}
                      onValueChange={(value) => handleFilterChange(value === "reset" ? null : value || null)}
                    >
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="Select batch" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reset">All Batches</SelectItem>
                        {Array.from(
                          new Set(
                            coursesArray.flatMap((course) => {
                              const batchMatch = course.batch.match(/(\d+)$/)
                              const courseBatch = batchMatch ? batchMatch[1] : null

                              const sectionBatches = course.sections.map((section) => {
                                const match = section.section.match(/^(\d+)/)
                                return match ? match[1] : null
                              })

                              return [courseBatch, ...sectionBatches].filter(
                                (batch): batch is string => Boolean(batch),
                              )
                            }),
                          ),
                        )
                          .sort((a, b) => Number(b) - Number(a))
                          .map((batch) => (
                            <SelectItem key={batch} value={batch}>
                              Batch {batch}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <label className="text-sm font-medium green-title">Exact Days</label>
                    </div>
                    <Select value={maxDays.toString()} onValueChange={(value) => setMaxDays(Number.parseInt(value))}>
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="Exact days">
                          Exactly {maxDays} day{maxDays !== 1 ? "s" : ""}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6].map((num) => (
                          <SelectItem key={num} value={num.toString()}>
                            Exactly {num} day{num !== 1 ? "s" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <label className="text-sm font-medium green-title">Preferred Days</label>
                    </div>
                    <DaySelector selectedDays={selectedDays} onChange={setSelectedDays} />
                  </div>
                </div>

                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                  <InfoIcon size={14} />
                  <span>{getRelationshipExplanation()}</span>
                </div>
              </CardContent>
            </Card>

            <ContributorSection />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
            <div className="space-y-4">
              <div className="flex items-center">
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold green-title">
                    Available Courses
                    {selectedBatch ? (
                      <span className="text-sm text-muted-foreground">
                        Showing {filteredCourses.length} courses for batch {selectedBatch}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {" "}
                        ( Select a batch to enable course selection )
                      </span>
                    )}
                  </h2>
                </div>
              </div>
              <div className="h-[calc(100%-40px)] overflow-auto" data-tour="course-list">
                <CourseList
                  courses={filteredCourses}
                  selectedCourses={selectedCourses}
                  onToggleCourse={handleToggleCourse}
                  sectionFilters={sectionFilters}
                  onSectionFilter={handleSectionFilter}
                  selectedBatch={selectedBatch}
                />
              </div>
            </div>

            <div className="flex flex-col" data-tour="selected-courses">
              <div className="flex flex-col space-y-4 mb-4">
                <div className="flex flex-col gap-2 w-full">
                  {combinations.length > 0 && (
                    <Button variant="outline" onClick={() => setShowCombinations(true)} className="w-full">
                      View Combinations ({combinations.length})
                    </Button>
                  )}
                  <Button
                    onClick={() => handleGenerateCombinations()}
                    disabled={selectedCourses.size === 0}
                    data-tour="generate-button"
                    className="w-full relative group bg-primary text-white hover:bg-primary/90"
                  >
                    Generate Combinations
                  </Button>
                </div>
              </div>
              <div className="flex-1">
                <SelectedCoursesList
                  selectedCourses={selectedCourses}
                  sectionFilters={sectionFilters}
                  courses={coursesArray}
                  selectedDays={selectedDays}
                  onGenerateCombinations={handleGenerateCombinations}
                  onRemoveCourse={(courseCode) => {
                    const newSelected = new Set(selectedCourses)
                    newSelected.delete(courseCode)
                    setSelectedCourses(newSelected)

                    // Also remove from section filters
                    const newSectionFilters = { ...sectionFilters }
                    delete newSectionFilters[courseCode]
                    setSectionFilters(newSectionFilters)

                    // Reset combinations when removing courses
                    setCombinations([])
                    setCurrentCombinationIndex(0)
                    setShowCombinations(false)
                  }}
                  onRemoveAll={() => {
                    setSelectedCourses(new Set())
                    setSectionFilters({})
                    setCombinations([])
                    setCurrentCombinationIndex(0)
                    setShowCombinations(false)
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <CombinationsDialog
          open={showCombinations}
          onOpenChange={setShowCombinations}
          combinations={combinations}
          courses={coursesArray}
          currentIndex={currentCombinationIndex}
          onIndexChange={setCurrentCombinationIndex}
          selectedCombinationIndex={selectedCombinationIndex}
          onSelectCombination={setSelectedCombinationIndex}
          className="combinations-dialog"
        />

        <NoCombinationsDialog
          open={showNoCombinationsError}
          onOpenChange={setShowNoCombinationsError}
          errorMessage="No valid combinations found. Some courses may have schedule conflicts or don't fit your day preferences."
          selectedCourseCodes={Array.from(selectedCourses)}
          selectedDays={selectedDays}
          maxDays={maxDays}
        />
      </main>
    </div>
  )
}
