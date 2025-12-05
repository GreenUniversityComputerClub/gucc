"use client"
import type { Course, SectionWithCourse } from "../data/courses"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getDepartmentBgColor, getDepartmentTextColor, getCourseBlockSizeClass } from "../lib/utils/department-colors"
import { useMediaQuery } from "../lib/hooks/use-media-query"
import { useEffect, useState } from "react"
import { ScheduleExport } from "./schedule-export"

interface ScheduleViewProps {
  selectedCourses: Map<string, SectionWithCourse>
  courses: Course[]
}

const REGULAR_DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]

// Normalize raw day strings from data (which may be uppercase like "SAT")
const normalizeDay = (day: string): string => {
  const upper = day.toUpperCase()
  const map: Record<string, string> = {
    SAT: "Sat",
    SUN: "Sun",
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
  }
  return map[upper] || day
}
const REGULAR_TIME_SLOTS = [
  "08:30:AM - 10:00:AM",
  "10:00:AM - 11:30:AM",
  "11:30:AM - 01:00:PM",
  "01:30:PM - 03:00:PM",
  "03:00:PM - 04:30:PM",
]

const FRIDAY_TIME_SLOTS = [
  "08:00:AM - 09:30:AM",
  "09:30:AM - 11:00:AM",
  "11:00:AM - 12:30:PM",
  "02:00:PM - 03:30:PM",
  "03:30:PM - 05:00:PM",
]

// Convert 12-hour time format to minutes since midnight
const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes, period] = timeStr.split(":")
  const hr = Number.parseInt(hours)
  const min = Number.parseInt(minutes)

  let totalHours = hr
  if (period.includes("PM") && hr !== 12) totalHours += 12
  if (period.includes("AM") && hr === 12) totalHours = 0

  return totalHours * 60 + min
}

const calculateDuration = (startTime: string, endTime: string): number => {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  return Math.abs(end - start)
}

const calculateTimeSlotSpan = (startTime: string, endTime: string): number => {
  const duration = calculateDuration(startTime, endTime)
  const slots = Math.ceil(duration / 90)
  return Math.min(slots, 3)
}

const isWithinTimeSlot = (classTime: string, slotTime: string): boolean => {
  const [classStart, classEnd] = classTime.split(" - ")
  const [slotStart, slotEnd] = slotTime.split(" - ")

  const classStartMinutes = timeToMinutes(classStart)
  const slotStartMinutes = timeToMinutes(slotStart)

  return Math.abs(classStartMinutes - slotStartMinutes) <= 15
}

const getCoursesForSlot = (
  day: string,
  timeSlot: string,
  selectedCourses: Map<string, SectionWithCourse>,
  coursesList: Course[],
): Array<{
  title: string
  section: string
  room: string | null
  colSpan: number
  duration: number
  scheduleTime: string
  courseCode: string
  uniqueKey: string
  credits: number
}> => {
  const result = []

  for (const [uniqueKey, section] of selectedCourses) {
    for (const schedule of section.schedule) {
      if (normalizeDay(schedule.day) === day && isWithinTimeSlot(schedule.time, timeSlot)) {
        const [classStart, classEnd] = schedule.time.split(" - ")
        const course = coursesList.find((c) => c.formalCode === section.courseCode)

        if (course) {
          result.push({
            title: course.title,
            section: section.section,
            room: schedule.room,
            colSpan: calculateTimeSlotSpan(classStart, classEnd),
            duration: calculateDuration(classStart, classEnd),
            scheduleTime: schedule.time,
            courseCode: section.courseCode,
            uniqueKey,
            credits: course.credits,
          })
        }
      }
    }
  }

  return result
}

// Increase the minimum heights for course blocks to make them more visible in exports
const COURSE_BLOCK_SIZE_MAP: Record<string, string> = {
  "1": "course-block-1",
  "1.5": "course-block-1-5",
  "2": "course-block-2",
  "3": "course-block-3",
  "4": "course-block-4",
}

// Update the ScheduleView component to add classes for export identification
export default function ScheduleView({ selectedCourses, courses }: ScheduleViewProps) {
  // Use state instead of hook for initial render to avoid hydration mismatch
  const [isMobileView, setIsMobileView] = useState(false)

  // Use the media query hook to detect mobile screens
  const isMobileQuery = useMediaQuery("(max-width: 640px)")

  // Update the state when the media query changes
  useEffect(() => {
    setIsMobileView(isMobileQuery)
  }, [isMobileQuery])

  // Force mobile view on small screens for client-side rendering
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsMobileView(window.innerWidth <= 640)

      const handleResize = () => {
        setIsMobileView(window.innerWidth <= 640)
      }

      window.addEventListener("resize", handleResize)
      return () => window.removeEventListener("resize", handleResize)
    }
  }, [])

  const getActiveDays = () => {
    const activeDays = new Set<string>()
    for (const [_, section] of selectedCourses) {
      section.schedule.forEach((schedule) => {
        activeDays.add(normalizeDay(schedule.day))
      })
    }
    const regularDays = REGULAR_DAYS.filter((day) => activeDays.has(day))
    const hasFriday = activeDays.has("Fri")
    return { regularDays, hasFriday }
  }

  const { regularDays, hasFriday } = getActiveDays()

  if (regularDays.length === 0 && !hasFriday) {
    return <div className="text-center py-6 text-muted-foreground">No classes scheduled</div>
  }

  const computeCoursesByDayAndSlot = (days: string[], timeSlots: string[]) => {
    const coursesByDayAndSlot = new Map<string, Array<any>>()

    days.forEach((day) => {
      timeSlots.forEach((timeSlot) => {
        const key = `${day}-${timeSlot}`
        const coursesInSlot = getCoursesForSlot(day, timeSlot, selectedCourses, courses)
        coursesByDayAndSlot.set(key, coursesInSlot)
      })
    })

    return coursesByDayAndSlot
  }

  // Mobile view for the schedule - add mobile-only class for export identification
  const renderMobileSchedule = (days: string[], timeSlots: string[]) => {
    return (
      <div className="space-y-4 mobile-only">
        {days.map((day) => (
          <div key={`mobile-day-${day}`} className="border rounded-md overflow-hidden">
            <div className="bg-muted p-2 font-medium text-center">{day}</div>
            <div className="divide-y">
              {timeSlots.map((timeSlot) => {
                const slotKey = `${day}-${timeSlot}`
                const coursesForSlot = computeCoursesByDayAndSlot(days, timeSlots).get(slotKey) || []

                return (
                  <div key={`mobile-${slotKey}`} className="p-2">
                    <div className="text-xs text-muted-foreground mb-1">{timeSlot}</div>
                    {coursesForSlot.length > 0 ? (
                      <div className="space-y-2">
                        {coursesForSlot.map((courseInfo) => (
                          <div
                            key={`mobile-course-${courseInfo.uniqueKey}`}
                            className={`rounded-md ${getDepartmentBgColor(courseInfo.courseCode)} p-2 text-sm`}
                          >
                            <p className={`font-medium ${getDepartmentTextColor(courseInfo.courseCode)}`}>
                              {courseInfo.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {courseInfo.section} • {courseInfo.room || "TBA"}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-4 text-xs text-muted-foreground italic">No classes</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderTimeTable = (days: string[], timeSlots: string[]) => {
    const coursesByDayAndSlot = computeCoursesByDayAndSlot(days, timeSlots)
    const renderedCourseKeys = new Map<string, Set<string>>()

    days.forEach((day) => {
      renderedCourseKeys.set(day, new Set<string>())
    })

    // Add desktop-view class for export identification
    return (
      <div className="overflow-x-auto desktop-view w-full">
        <Table className="desktop-export-table w-full table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px] min-w-[60px]">Day</TableHead>
              {timeSlots.map((timeSlot) => (
                <TableHead
                  key={`header-${timeSlot}`}
                  className="h-10 text-center text-xs whitespace-nowrap"
                  style={{ width: `${(100 - 5) / timeSlots.length}%` }} // Equal width for all time slots
                >
                  {timeSlot}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => {
              const coveredSlots = new Set<number>()

              return (
                <TableRow key={`day-${day}`}>
                  <TableCell className="font-medium text-center w-[60px]">{day}</TableCell>
                  {timeSlots.map((timeSlot, slotIndex) => {
                    if (coveredSlots.has(slotIndex)) {
                      return null
                    }

                    const slotKey = `${day}-${timeSlot}`
                    const coursesForSlot = coursesByDayAndSlot.get(slotKey) || []
                    const unrenderedCourses = coursesForSlot.filter(
                      (course) => !renderedCourseKeys.get(day)?.has(course.uniqueKey),
                    )

                    if (unrenderedCourses.length > 0) {
                      const courseInfo = unrenderedCourses[0]
                      renderedCourseKeys.get(day)?.add(courseInfo.uniqueKey)

                      for (let i = 1; i < courseInfo.colSpan && slotIndex + i < timeSlots.length; i++) {
                        coveredSlots.add(slotIndex + i)
                      }

                      // Get department-specific styling
                      const bgColorClass = getDepartmentBgColor(courseInfo.courseCode)
                      const textColorClass = getDepartmentTextColor(courseInfo.courseCode)
                      const blockSizeClass = getCourseBlockSizeClass(courseInfo.credits)

                      return (
                        <TableCell
                          key={`${slotKey}-${courseInfo.uniqueKey}`}
                          colSpan={courseInfo.colSpan}
                          className="p-2"
                          style={{
                            width: `${((100 - 5) / timeSlots.length) * courseInfo.colSpan}%`,
                          }} // Adjust width based on colspan
                        >
                          <div
                            className={`rounded-md ${bgColorClass} p-3 text-center ${blockSizeClass} flex flex-col justify-center w-full`}
                            style={{ minHeight: "90px" }}
                          >
                            <p
                              className={`font-medium ${textColorClass} text-sm`}
                              style={{
                                wordBreak: "break-word",
                                whiteSpace: "normal",
                                overflow: "visible",
                                lineHeight: "1.3",
                              }}
                            >
                              {courseInfo.title}
                            </p>
                            <p
                              className="text-xs text-muted-foreground mt-1"
                              style={{
                                wordBreak: "break-word",
                                whiteSpace: "normal",
                                overflow: "visible",
                              }}
                            >
                              {courseInfo.section} • {courseInfo.room || "TBA"}
                            </p>
                          </div>
                        </TableCell>
                      )
                    }

                    return (
                      <TableCell
                        key={`${slotKey}-empty`}
                        style={{ width: `${(100 - 5) / timeSlots.length}%` }} // Equal width for empty cells
                      />
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  }

  // Always render both views, but hide one based on screen size
  // This allows the export functions to access the desktop view even on mobile
  return (
    <div className="space-y-4">
      <ScheduleExport scheduleId="schedule-container" selectedCourses={selectedCourses} courses={courses} />
      <div id="schedule-container" className="space-y-8" aria-label="Course schedule timetable">
        {/* For mobile devices */}
        <div className={isMobileView ? "block" : "hidden"}>
          {regularDays.length > 0 && renderMobileSchedule(regularDays, REGULAR_TIME_SLOTS)}
          {hasFriday && renderMobileSchedule(["Fri"], FRIDAY_TIME_SLOTS)}
        </div>

        {/* For desktop devices */}
        <div className={isMobileView ? "hidden" : "block"}>
          {regularDays.length > 0 && renderTimeTable(regularDays, REGULAR_TIME_SLOTS)}
          {hasFriday && renderTimeTable(["Fri"], FRIDAY_TIME_SLOTS)}
        </div>

        {/* Hidden desktop view for export purposes */}
        <div className="hidden export-only-view w-full">
          {regularDays.length > 0 && renderTimeTable(regularDays, REGULAR_TIME_SLOTS)}
          {hasFriday && renderTimeTable(["Fri"], FRIDAY_TIME_SLOTS)}
        </div>
      </div>
    </div>
  )
}
