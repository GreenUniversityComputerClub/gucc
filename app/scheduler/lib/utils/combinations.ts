import type { Course, CourseSection } from "../../data/courses"
import { shuffleArray } from "../utils/suffleArray"

// Enhanced type to include course code
interface SectionWithCourse extends CourseSection {
  courseCode: string
}

// Convert time to minutes for easier comparison
const timeToMinutes = (timeStr: string): number => {
  const [time, period] = timeStr.split(" ")
  const [hours, minutes] = time.split(":").map(Number)
  let totalMinutes = hours * 60 + minutes

  if (period === "PM" && hours !== 12) {
    totalMinutes += 12 * 60
  } else if (period === "AM" && hours === 12) {
    totalMinutes = minutes
  }

  return totalMinutes
}

// Check if two time slots conflict
const hasTimeConflict = (time1: string, time2: string): boolean => {
  const [start1, end1] = time1.split(" - ")
  const [start2, end2] = time2.split(" - ")

  const start1Min = timeToMinutes(start1)
  const end1Min = timeToMinutes(end1)
  const start2Min = timeToMinutes(start2)
  const end2Min = timeToMinutes(end2)

  // Check if one time slot starts during another time slot
  return (
    (start1Min >= start2Min && start1Min < end2Min) ||
    (start2Min >= start1Min && start2Min < end1Min) ||
    (start1Min === start2Min && end1Min === end2Min)
  )
}

// Check if two sections have conflicting schedules
const hasScheduleConflict = (section1: SectionWithCourse, section2: SectionWithCourse): boolean => {
  for (const schedule1 of section1.schedule) {
    for (const schedule2 of section2.schedule) {
      if (schedule1.day === schedule2.day && hasTimeConflict(schedule1.time, schedule2.time)) {
        console.log(`Time conflict detected:`)
        console.log(`${section1.courseCode}: ${schedule1.day} ${schedule1.time}`)
        console.log(`${section2.courseCode}: ${schedule2.day} ${schedule2.time}`)
        return true
      }
    }
  }
  return false
}

// Check if a section conflicts with any section in the current combination
const hasConflictWithCombination = (section: SectionWithCourse, combination: SectionWithCourse[]): boolean => {
  // Track all conflicts for logging purposes
  const conflicts = combination.filter((existingSection) => hasScheduleConflict(section, existingSection))

  if (conflicts.length > 0) {
    console.log(`Section ${section.courseCode} conflicts with ${conflicts.length} courses:`)
    conflicts.forEach((conflict) => {
      console.log(`- ${conflict.courseCode}`)
    })
    return true
  }

  return false
}

// Count unique days in a combination
const countUniqueDays = (combination: SectionWithCourse[]): number => {
  const days = new Set<string>()
  combination.forEach((section) => {
    section.schedule.forEach((schedule) => {
      days.add(schedule.day)
    })
  })
  return days.size
}

// Get all days used in a combination
const getDaysInCombination = (combination: SectionWithCourse[]): Set<string> => {
  const days = new Set<string>()
  combination.forEach((section) => {
    section.schedule.forEach((schedule) => {
      days.add(schedule.day)
    })
  })
  return days
}

// Check if a combination uses preferred days correctly according to the new logic:
// 1. Always use exactly maxDays number of days
// 2. Prioritize using preferred days first
// 3. If not enough preferred days, fill with other days
const usesPreferredDaysCorrectly = (
  combination: SectionWithCourse[],
  preferredDays: Set<string>,
  maxDays: number,
): boolean => {
  // If no specific days are selected, just ensure we use exactly maxDays
  if (preferredDays.size === 0) {
    return countUniqueDays(combination) === maxDays
  }

  const daysInCombination = getDaysInCombination(combination)

  // First check: we must use exactly maxDays
  if (daysInCombination.size !== maxDays) {
    return false
  }

  // Second check: we must prioritize preferred days
  // Count how many preferred days are used
  const preferredDaysUsed = [...daysInCombination].filter((day) => preferredDays.has(day))

  // Count how many preferred days are available but not used
  const unusedPreferredDays = [...preferredDays].filter((day) => !daysInCombination.has(day))

  // Count how many non-preferred days are used
  const nonPreferredDaysUsed = [...daysInCombination].filter((day) => !preferredDays.has(day))

  // If we're using non-preferred days while there are still preferred days available,
  // that's not optimal - we should be using the preferred days first
  if (nonPreferredDaysUsed.length > 0 && unusedPreferredDays.length > 0) {
    return false
  }

  // If we reach here, it means:
  // 1. We're using exactly maxDays days
  // 2. We're using all available preferred days before using non-preferred days
  return true
}

// Generate all possible combinations recursively
function generateCombinationsRecursive(
  courses: Course[],
  currentIndex: number,
  currentCombination: SectionWithCourse[],
  allCombinations: SectionWithCourse[][],
  maxDays: number,
  preferredDays: Set<string>,
): void {
  // Base case: we've processed all courses
  if (currentIndex === courses.length) {
    if (currentCombination.length === courses.length) {
      // Only add combinations that use exactly the maximum number of days
      // and follow the preferred days relationship
      if (
        countUniqueDays(currentCombination) === maxDays &&
        usesPreferredDaysCorrectly(currentCombination, preferredDays, maxDays)
      ) {
        allCombinations.push([...currentCombination])
      }
    }
    return
  }

  const currentCourse = courses[currentIndex]

  // Try each section of the current course
  for (const section of currentCourse.sections) {
    // Create enhanced section with course code
    const sectionWithCourse: SectionWithCourse = {
      ...section,
      courseCode: currentCourse.formalCode,
    }

    // Skip if this section conflicts with any section in our current combination
    if (hasConflictWithCombination(sectionWithCourse, currentCombination)) {
      continue
    }

    // Add this section to our combination and recurse
    currentCombination.push(sectionWithCourse)

    // Check if adding this section would exceed the maximum number of days
    // We'll still generate the combination and filter later if needed
    generateCombinationsRecursive(
      courses,
      currentIndex + 1,
      currentCombination,
      allCombinations,
      maxDays,
      preferredDays,
    )

    currentCombination.pop()
    if(allCombinations.length >= 100){
            return
    }
  }
}

export const generateCombinations = (
  selectedCourses: Course[],
  maxDays = 6,
  preferredDays: string[] = [],
  options?: {
    seed?: number
    useCrypto?: boolean
  },
): SectionWithCourse[][] => {
  if (!selectedCourses || selectedCourses.length === 0) return []

  try {
    // Sort courses by number of sections (ascending) for better performance
    const sortedCourses = [...selectedCourses].sort((a, b) => a.sections.length - b.sections.length)

    // Shuffle sections for each course to randomize combinations
    // Use the enhanced shuffleArray with options if provided
    const coursesWithShuffledSections = sortedCourses.map((course) => ({
      ...course,
      sections: shuffleArray(course.sections, options),
    }))

    // Ensure all teacher names are lowercase
    coursesWithShuffledSections.forEach((course) => {
      course.sections.forEach((section) => {
        if (section.teachers) {
          section.teachers = section.teachers.toLowerCase()
        }
      })
    })

    // Initialize result array
    const combinations: SectionWithCourse[][] = []

    // Convert preferred days array to a Set for faster lookups
    const preferredDaysSet = new Set(preferredDays)

    // Generate combinations recursively
    generateCombinationsRecursive(coursesWithShuffledSections, 0, [], combinations, maxDays, preferredDaysSet)

    // Validate combinations
    const validCombinations = combinations.filter((combination) => {
      // Check if we have the correct number of sections
      if (combination.length !== selectedCourses.length) return false

      // Check for duplicate course codes
      const courseCodes = new Set(combination.map((section) => section.courseCode))
      if (courseCodes.size !== selectedCourses.length) return false

      // Check for time conflicts between all pairs of sections
      for (let i = 0; i < combination.length; i++) {
        for (let j = i + 1; j < combination.length; j++) {
          if (hasScheduleConflict(combination[i], combination[j])) {
            return false
          }
        }
      }

      // Check if the combination uses exactly the maximum number of days
      if (countUniqueDays(combination) !== maxDays) {
        return false
      }

      // Check if the combination follows the preferred days relationship
      if (!usesPreferredDaysCorrectly(combination, preferredDaysSet, maxDays)) {
        return false
      }

      return true
    })

    // Shuffle the final combinations to further randomize the order
    const shuffledCombinations = shuffleArray(validCombinations, options)

    return shuffledCombinations
  } catch (error) {
    console.error("Error generating combinations:", error)
    return []
  }
}

export const calculateTotalCredits = (courses: Course[]): number => {
  return courses.reduce((sum, course) => sum + course.credits, 0)
}
