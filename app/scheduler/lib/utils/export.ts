import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import type { Course, SectionWithCourse } from "../../data/courses"

// Helper function to format the current date and time
const formatDateTime = (): string => {
  const now = new Date()
  return now.toLocaleString()
}

// Helper function to get total credits
const getTotalCredits = (selectedCourses: Map<string, SectionWithCourse>, courses: Course[]): number => {
  let totalCredits = 0
  for (const [_, section] of selectedCourses) {
    const course = courses.find((c) => c.formalCode === section.courseCode)
    if (course) {
      totalCredits += course.credits
    }
  }
  return totalCredits
}

// Draw a styled table in PDF
const drawTable = (
  pdf: jsPDF,
  headers: string[],
  data: string[][],
  startY: number,
  options: {
    headerBgColor?: [number, number, number]
    headerTextColor?: [number, number, number]
    alternateRowColor?: boolean
    fontSize?: number
    cellPadding?: number
    colWidths?: number[]
  } = {},
): number => {
  const {
    headerBgColor = [41, 128, 185],
    headerTextColor = [255, 255, 255],
    alternateRowColor = true,
    fontSize = 10, // Increased from 8
    cellPadding = 4, // Increased from 3
    colWidths = headers.map(() => pdf.internal.pageSize.getWidth() / headers.length),
  } = options

  pdf.setFontSize(fontSize)

  // Calculate row height based on font size
  const lineHeight = fontSize * 0.6 // Increased from 0.5

  // Start position
  let currentY = startY
  let currentX = 10

  // Draw header
  pdf.setFillColor(...headerBgColor)
  pdf.setTextColor(...headerTextColor)
  pdf.setFont("helvetica", "bold")

  // Draw header background
  pdf.rect(currentX, currentY, pdf.internal.pageSize.getWidth() - 20, lineHeight + cellPadding * 2, "F")

  // Draw header text
  headers.forEach((header, i) => {
    pdf.text(header, currentX + cellPadding, currentY + lineHeight + cellPadding)
    currentX += colWidths[i]
  })

  // Move to next row
  currentY += lineHeight + cellPadding * 2

  // Draw data rows
  pdf.setFont("helvetica", "normal")

  data.forEach((row, rowIndex) => {
    currentX = 10

    // Alternate row background
    if (alternateRowColor && rowIndex % 2 === 1) {
      pdf.setFillColor(245, 245, 245) // Lighter gray
      pdf.rect(currentX, currentY, pdf.internal.pageSize.getWidth() - 20, lineHeight + cellPadding * 2, "F")
    }

    // Reset text color for data
    pdf.setTextColor(0, 0, 0)

    // Draw cell text
    row.forEach((cell, i) => {
      pdf.text(cell, currentX + cellPadding, currentY + lineHeight + cellPadding)
      currentX += colWidths[i]
    })

    // Draw horizontal line
    pdf.setDrawColor(220, 220, 220)
    pdf.line(
      10,
      currentY + lineHeight + cellPadding * 2,
      pdf.internal.pageSize.getWidth() - 10,
      currentY + lineHeight + cellPadding * 2,
    )

    // Move to next row
    currentY += lineHeight + cellPadding * 2
  })

  return currentY
}

// Draw a styled header with optional subtitle
const drawHeader = (
  pdf: jsPDF,
  title: string,
  subtitle?: string,
  options: {
    titleSize?: number
    subtitleSize?: number
    titleColor?: [number, number, number]
    subtitleColor?: [number, number, number]
    withLine?: boolean
    lineColor?: [number, number, number]
    align?: "left" | "center" | "right"
  } = {},
): number => {
  const {
    titleSize = 16, // Increased from 14
    subtitleSize = 10, // Increased from 8
    titleColor = [41, 128, 185], // Blue title
    subtitleColor = [100, 100, 100],
    withLine = true,
    lineColor = [220, 220, 220],
    align = "center",
  } = options

  let yPos = 15 // Increased from 10
  const pageWidth = pdf.internal.pageSize.getWidth()
  const xPos = align === "center" ? pageWidth / 2 : align === "right" ? pageWidth - 10 : 10

  // Draw title
  pdf.setFontSize(titleSize)
  pdf.setTextColor(...titleColor)
  pdf.setFont("helvetica", "bold")
  pdf.text(title, xPos, yPos, { align })

  yPos += titleSize * 0.4

  // Draw line under title
  if (withLine) {
    pdf.setDrawColor(...lineColor)
    pdf.setLineWidth(0.5)
    pdf.line(10, yPos + 2, pageWidth - 10, yPos + 2)
    yPos += 4
  }

  // Draw subtitle if provided
  if (subtitle) {
    yPos += 4
    pdf.setFontSize(subtitleSize)
    pdf.setTextColor(...subtitleColor)
    pdf.setFont("helvetica", "normal")
    pdf.text(subtitle, xPos, yPos, { align })
    yPos += subtitleSize * 0.4
  }

  return yPos + 8
}

// Draw a styled footer
const drawFooter = (pdf: jsPDF, text: string): void => {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  pdf.setFontSize(8)
  pdf.setTextColor(150, 150, 150)
  pdf.text(text, pageWidth / 2, pageHeight - 8, { align: "center" })
}

// Helper function to convert time to minutes for comparison
function timeToMinutes(time: string): number {
  const [hours, minutesWithAMPM] = time.split(":")
  const minutes = minutesWithAMPM.substring(0, 2)
  const ampm = minutesWithAMPM.substring(2)
  let hoursIn24 = Number.parseInt(hours, 10)
  if (ampm.toLowerCase() === "pm" && hoursIn24 !== 12) {
    hoursIn24 += 12
  } else if (ampm.toLowerCase() === "am" && hoursIn24 === 12) {
    hoursIn24 = 0
  }
  return hoursIn24 * 60 + Number.parseInt(minutes, 10)
}

// Modify the exportScheduleAsPDF function to better handle mobile devices
// Replace the entire function with this improved version:

export const exportScheduleAsPDF = async (
  scheduleId: string,
  selectedCourses: Map<string, SectionWithCourse>,
  courses: Course[],
): Promise<void> => {
  try {
    const scheduleElement = document.getElementById(scheduleId)
    if (!scheduleElement) {
      console.error("Schedule element not found")
      return
    }

    // Create a temporary container for the export
    const tempContainer = document.createElement("div")
    tempContainer.style.position = "absolute"
    tempContainer.style.left = "-9999px"
    tempContainer.style.width = "1200px" // Force desktop width
    tempContainer.style.maxWidth = "100%" // Ensure it doesn't overflow
    tempContainer.style.backgroundColor = "white"
    tempContainer.style.padding = "20px"
    tempContainer.style.boxSizing = "border-box" // Include padding in width calculation
    tempContainer.classList.add("force-desktop-layout")
    document.body.appendChild(tempContainer)

    // Add title and metadata
    const title = document.createElement("h1")
    title.textContent = "Course Schedule"
    title.style.textAlign = "center"
    title.style.marginBottom = "5px"
    title.style.color = "#2980b9"
    title.style.fontFamily = "Arial, sans-serif"
    tempContainer.appendChild(title)

    const timestamp = document.createElement("p")
    timestamp.textContent = `Generated: ${formatDateTime()}`
    timestamp.style.textAlign = "center"
    timestamp.style.marginBottom = "10px"
    timestamp.style.color = "#7f8c8d"
    tempContainer.appendChild(timestamp)

    const credits = document.createElement("p")
    credits.textContent = `Total Credits: ${getTotalCredits(selectedCourses, courses)}`
    credits.style.textAlign = "center"
    credits.style.marginBottom = "20px"
    credits.style.fontWeight = "bold"
    credits.style.color = "#2c3e50"
    tempContainer.appendChild(credits)

    // Add a horizontal line
    const hr = document.createElement("hr")
    hr.style.border = "none"
    hr.style.borderTop = "1px solid #e0e0e0"
    hr.style.margin = "20px 0"
    tempContainer.appendChild(hr)

    // Find the hidden export view or create a desktop table view
    let scheduleClone: HTMLElement
    const exportView = scheduleElement.querySelector(".export-only-view")

    if (exportView) {
      scheduleClone = exportView.cloneNode(true) as HTMLElement
      scheduleClone.classList.remove("hidden")
      scheduleClone.classList.remove("export-only-view")
    } else {
      // Create a desktop-style table manually if export view is not found
      scheduleClone = createDesktopScheduleView(selectedCourses, courses)
    }

    scheduleClone.style.border = "1px solid #e0e0e0"
    scheduleClone.style.borderRadius = "4px"
    scheduleClone.style.padding = "8px"
    scheduleClone.style.backgroundColor = "#f9f9f9"
    scheduleClone.style.width = "100%" // Ensure schedule uses full width
    scheduleClone.style.boxSizing = "border-box" // Include padding in width calculation
    tempContainer.appendChild(scheduleClone)

    // Add course details table
    const detailsTitle = document.createElement("h2")
    detailsTitle.textContent = "Course Details"
    detailsTitle.style.marginTop = "30px"
    detailsTitle.style.color = "#2980b9"
    detailsTitle.style.borderBottom = "2px solid #3498db"
    detailsTitle.style.paddingBottom = "5px"
    tempContainer.appendChild(detailsTitle)

    const detailsTable = createCourseDetailsTable(selectedCourses, courses)
    tempContainer.appendChild(detailsTable)

    // Add footer
    const footer = document.createElement("div")
    footer.style.marginTop = "30px"
    footer.style.borderTop = "1px solid #e0e0e0"
    footer.style.paddingTop = "10px"
    footer.style.textAlign = "center"
    footer.style.color = "#95a5a6"
    footer.style.fontSize = "12px"
    footer.textContent = `Generated on ${formatDateTime()} • Course Scheduler`
    tempContainer.appendChild(footer)

    // Capture as image
    const canvas = await html2canvas(tempContainer, {
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "white",
      width: 1200, // Force width for consistent rendering
      windowWidth: 1200, // Set window width to match container width
    })

    // Clean up
    document.body.removeChild(tempContainer)

    // Create PDF from the captured image
    const imgData = canvas.toDataURL("image/png", 1.0)
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    })

    // Calculate image dimensions to fit on PDF
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pageWidth - 20
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    // Add the image to the PDF
    pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight > pageHeight - 20 ? pageHeight - 20 : imgHeight)

    // Save PDF with a fallback for mobile browsers
    try {
      pdf.save(`course-schedule-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (error) {
      console.error("Error saving PDF directly:", error)
      // Fallback for mobile browsers
      const pdfBlob = pdf.output("blob")
      const pdfUrl = URL.createObjectURL(pdfBlob)

      // Create a link and open in new tab
      const link = document.createElement("a")
      link.href = pdfUrl
      link.target = "_blank"
      link.download = `course-schedule-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  } catch (error) {
    console.error("Error exporting schedule as PDF:", error)
    alert("Failed to export as PDF. Please try the image export option instead.")
  }
}

// Add these helper functions after the exportScheduleAsPDF function:

// Helper function to create a desktop-style schedule view
function createDesktopScheduleView(selectedCourses: Map<string, SectionWithCourse>, courses: Course[]): HTMLElement {
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
  const container = document.createElement("div")
  container.className = "desktop-schedule-view"
  container.style.width = "100%" // Ensure container uses full width

  // Get active days
  const activeDays = new Set<string>()
  for (const [_, section] of selectedCourses) {
    section.schedule.forEach((schedule) => {
      activeDays.add(normalizeDay(schedule.day))
    })
  }

  const regularDays = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu"].filter((day) => activeDays.has(day))
  const hasFriday = activeDays.has("Fri")

  // Create regular days table
  if (regularDays.length > 0) {
    container.appendChild(
      createScheduleTable(
        regularDays,
        [
          "08:30:AM - 10:00:AM",
          "10:00:AM - 11:30:AM",
          "11:30:AM - 01:00:PM",
          "01:30:PM - 03:00:PM",
          "03:00:PM - 04:30:PM",
        ],
        selectedCourses,
        courses,
      ),
    )
  }

  // Create Friday table
  if (hasFriday) {
    container.appendChild(
      createScheduleTable(
        ["Fri"],
        [
          "08:00:AM - 09:30:AM",
          "09:30:AM - 11:00:AM",
          "11:00:AM - 12:30:PM",
          "02:00:PM - 03:30:PM",
          "03:30:PM - 05:00:PM",
        ],
        selectedCourses,
        courses,
      ),
    )
  }

  return container
}

// Helper function to create a schedule table
function createScheduleTable(
  days: string[],
  timeSlots: string[],
  selectedCourses: Map<string, SectionWithCourse>,
  courses: Course[],
): HTMLElement {
  const tableContainer = document.createElement("div")
  tableContainer.className = "schedule-table-container"
  tableContainer.style.marginBottom = "20px"
  tableContainer.style.width = "100%" // Ensure container uses full width

  const table = document.createElement("table")
  table.style.width = "100%"
  table.style.tableLayout = "fixed" // Use fixed layout to ensure equal column widths
  table.style.borderCollapse = "collapse"
  table.style.border = "1px solid #ddd"

  // Create header row
  const thead = document.createElement("thead")
  const headerRow = document.createElement("tr")

  // Add day header - make it narrower
  const dayHeader = document.createElement("th")
  dayHeader.textContent = "Day"
  dayHeader.style.padding = "10px"
  dayHeader.style.border = "1px solid #ddd"
  dayHeader.style.backgroundColor = "#f2f2f2"
  dayHeader.style.width = "60px" // Set a fixed width for the day column
  headerRow.appendChild(dayHeader)

  // Calculate equal width for time slots
  const timeSlotWidth = `${(100 - 5) / timeSlots.length}%` // 5% for the day column

  // Add time slot headers with equal width
  timeSlots.forEach((slot) => {
    const th = document.createElement("th")
    th.textContent = slot
    th.style.padding = "10px"
    th.style.border = "1px solid #ddd"
    th.style.backgroundColor = "#f2f2f2"
    th.style.width = timeSlotWidth // Set equal width for all time slots
    headerRow.appendChild(th)
  })

  thead.appendChild(headerRow)
  table.appendChild(thead)

  // Create body rows
  const tbody = document.createElement("tbody")

  days.forEach((day) => {
    const row = document.createElement("tr")

    // Add day cell
    const dayCell = document.createElement("td")
    dayCell.textContent = day
    dayCell.style.padding = "10px"
    dayCell.style.border = "1px solid #ddd"
    dayCell.style.fontWeight = "bold"
    dayCell.style.width = "60px" // Match the header width
    row.appendChild(dayCell)

    // Add time slot cells
    timeSlots.forEach((slot) => {
      const td = document.createElement("td")
      td.style.padding = "10px"
      td.style.border = "1px solid #ddd"
      td.style.height = "80px"
      td.style.verticalAlign = "middle" // Center content vertically
      td.style.width = timeSlotWidth // Set equal width for all time slots

      // Find courses for this day and time slot
      for (const [uniqueKey, section] of selectedCourses) {
        for (const schedule of section.schedule) {
          if (schedule.day === day && isWithinTimeSlot(schedule.time, slot)) {
            const course = courses.find((c) => c.formalCode === section.courseCode)
            if (course) {
              const courseDiv = document.createElement("div")
              courseDiv.style.backgroundColor = "#e0f2fe"
              courseDiv.style.padding = "8px"
              courseDiv.style.borderRadius = "4px"
              courseDiv.style.width = "100%" // Ensure course div uses full width
              courseDiv.style.boxSizing = "border-box" // Include padding in width calculation

              const titleP = document.createElement("p")
              titleP.textContent = course.title
              titleP.style.fontWeight = "bold"
              titleP.style.margin = "0 0 4px 0"
              titleP.style.textAlign = "center" // Center the title

              const detailsP = document.createElement("p")
              detailsP.textContent = `${section.section} • ${schedule.room || "TBA"}`
              detailsP.style.fontSize = "12px"
              detailsP.style.margin = "0"
              detailsP.style.textAlign = "center" // Center the details

              courseDiv.appendChild(titleP)
              courseDiv.appendChild(detailsP)
              td.appendChild(courseDiv)
              break
            }
          }
        }
      }

      row.appendChild(td)
    })

    tbody.appendChild(row)
  })

  table.appendChild(tbody)
  tableContainer.appendChild(table)
  return tableContainer
}

// Helper function to check if a class time is within a time slot
function isWithinTimeSlot(classTime: string, slotTime: string): boolean {
  const [classStart, classEnd] = classTime.split(" - ")
  const [slotStart, slotEnd] = slotTime.split(" - ")

  const classStartMinutes = timeToMinutes(classStart)
  const slotStartMinutes = timeToMinutes(slotStart)

  return Math.abs(classStartMinutes - slotStartMinutes) <= 15
}

// Helper function to create course details table
function createCourseDetailsTable(selectedCourses: Map<string, SectionWithCourse>, courses: Course[]): HTMLElement {
  const table = document.createElement("table")
  table.style.width = "100%"
  table.style.tableLayout = "fixed" // Use fixed layout for equal column widths
  table.style.borderCollapse = "collapse"
  table.style.marginTop = "10px"

  // Create header row
  const thead = document.createElement("thead")
  const headerRow = document.createElement("tr")

  // Define column widths as percentages - adjust these to ensure the table fills the width
  const columnWidths = ["15%", "30%", "10%", "10%", "20%", "15%"]

  // Add header cells
  const headerTexts = ["Course Code", "Title", "Section", "Credits", "Teacher", "Room"]
  headerTexts.forEach((text, index) => {
    const th = document.createElement("th")
    th.textContent = text
    th.style.padding = "10px"
    th.style.border = "1px solid #ddd"
    th.style.backgroundColor = "#f2f2f2"
    th.style.width = columnWidths[index] // Set percentage width
    headerRow.appendChild(th)
  })

  thead.appendChild(headerRow)
  table.appendChild(thead)

  // Create body rows
  const tbody = document.createElement("tbody")

  let rowIndex = 0
  for (const [_, section] of selectedCourses) {
    const course = courses.find((c) => c.formalCode === section.courseCode)
    if (course) {
      const row = document.createElement("tr")

      // Add zebra striping
      if (rowIndex % 2 === 1) {
        row.style.backgroundColor = "#f9f9f9"
      }
      rowIndex++

      // Course Code
      const codeCell = document.createElement("td")
      codeCell.textContent = section.courseCode
      codeCell.style.padding = "10px"
      codeCell.style.border = "1px solid #ddd"
      row.appendChild(codeCell)

      // Title
      const titleCell = document.createElement("td")
      titleCell.textContent = course.title
      titleCell.style.padding = "10px"
      titleCell.style.border = "1px solid #ddd"
      row.appendChild(titleCell)

      // Section
      const sectionCell = document.createElement("td")
      sectionCell.textContent = section.section
      sectionCell.style.padding = "10px"
      sectionCell.style.border = "1px solid #ddd"
      row.appendChild(sectionCell)

      // Credits
      const creditsCell = document.createElement("td")
      creditsCell.textContent = course.credits.toString()
      creditsCell.style.padding = "10px"
      creditsCell.style.border = "1px solid #ddd"
      row.appendChild(creditsCell)

      // Teacher
      const teacherCell = document.createElement("td")
      teacherCell.textContent = section.teachers || "TBA"
      teacherCell.style.padding = "10px"
      teacherCell.style.border = "1px solid #ddd"
      row.appendChild(teacherCell)

      // Room
      const roomCell = document.createElement("td")
      roomCell.textContent = section.schedule[0]?.room || "TBA"
      roomCell.style.padding = "10px"
      roomCell.style.border = "1px solid #ddd"
      row.appendChild(roomCell)

      tbody.appendChild(row)
    }
  }

  table.appendChild(tbody)
  return table
}

// Modify the exportScheduleAsImage function to better handle mobile devices
// Replace the entire function with this improved version:

export const exportScheduleAsImage = async (
  scheduleId: string,
  selectedCourses: Map<string, SectionWithCourse>,
  courses: Course[],
): Promise<void> => {
  try {
    const scheduleElement = document.getElementById(scheduleId)
    if (!scheduleElement) {
      console.error("Schedule element not found")
      return
    }

    // Create a container for the full export
    const exportContainer = document.createElement("div")
    exportContainer.style.backgroundColor = "white"
    exportContainer.style.padding = "20px"
    exportContainer.style.width = "1200px" // Force desktop width
    exportContainer.style.maxWidth = "100%" // Ensure it doesn't overflow
    exportContainer.style.boxSizing = "border-box" // Include padding in width calculation
    exportContainer.classList.add("force-desktop-layout")

    exportContainer.style.position = "absolute"
    exportContainer.style.left = "-9999px"
    document.body.appendChild(exportContainer)

    // Add title
    const title = document.createElement("h1")
    title.textContent = "Course Schedule"
    title.style.textAlign = "center"
    title.style.marginBottom = "5px"
    title.style.color = "#2980b9"
    title.style.fontFamily = "Arial, sans-serif"
    exportContainer.appendChild(title)

    // Add timestamp
    const timestamp = document.createElement("p")
    timestamp.textContent = `Generated: ${formatDateTime()}`
    timestamp.style.textAlign = "center"
    timestamp.style.marginBottom = "10px"
    timestamp.style.color = "#7f8c8d"
    exportContainer.appendChild(timestamp)

    // Add total credits
    const credits = document.createElement("p")
    credits.textContent = `Total Credits: ${getTotalCredits(selectedCourses, courses)}`
    credits.style.textAlign = "center"
    credits.style.marginBottom = "20px"
    credits.style.fontWeight = "bold"
    credits.style.color = "#2c3e50"
    exportContainer.appendChild(credits)

    // Add a horizontal line
    const hr = document.createElement("hr")
    hr.style.border = "none"
    hr.style.borderTop = "1px solid #e0e0e0"
    hr.style.margin = "20px 0"
    exportContainer.appendChild(hr)

    // Find the hidden export view or create a desktop table view
    let scheduleClone: HTMLElement
    const exportView = scheduleElement.querySelector(".export-only-view")

    if (exportView) {
      scheduleClone = exportView.cloneNode(true) as HTMLElement
      scheduleClone.classList.remove("hidden")
      scheduleClone.classList.remove("export-only-view")
    } else {
      // Create a desktop-style table manually if export view is not found
      scheduleClone = createDesktopScheduleView(selectedCourses, courses)
    }

    scheduleClone.style.border = "1px solid #e0e0e0"
    scheduleClone.style.borderRadius = "4px"
    scheduleClone.style.padding = "8px"
    scheduleClone.style.backgroundColor = "#f9f9f9"
    scheduleClone.style.width = "100%" // Ensure schedule uses full width
    scheduleClone.style.boxSizing = "border-box" // Include padding in width calculation
    exportContainer.appendChild(scheduleClone)

    // Add course details
    const detailsTitle = document.createElement("h2")
    detailsTitle.textContent = "Course Details"
    detailsTitle.style.marginTop = "30px"
    detailsTitle.style.color = "#2980b9"
    detailsTitle.style.borderBottom = "2px solid #3498db"
    detailsTitle.style.paddingBottom = "5px"
    exportContainer.appendChild(detailsTitle)

    const detailsTable = createCourseDetailsTable(selectedCourses, courses)
    exportContainer.appendChild(detailsTable)

    // Add footer
    const footer = document.createElement("div")
    footer.style.marginTop = "30px"
    footer.style.borderTop = "1px solid #e0e0e0"
    footer.style.paddingTop = "10px"
    footer.style.textAlign = "center"
    footer.style.color = "#95a5a6"
    footer.style.fontSize = "12px"
    footer.textContent = `Generated on ${formatDateTime()} • Course Scheduler`
    exportContainer.appendChild(footer)

    // Capture the full export as image
    const canvas = await html2canvas(exportContainer, {
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "white",
      width: 1200, // Force width for consistent rendering
      windowWidth: 1200, // Set window width to match container width
    })

    // Clean up
    document.body.removeChild(exportContainer)

    // Convert to image and download with fallback for mobile browsers
    try {
      const link = document.createElement("a")
      link.download = `course-schedule-${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL("image/png")
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Error with direct download:", error)

      // Fallback for mobile browsers
      const imgUrl = canvas.toDataURL("image/png")
      const newTab = window.open()
      if (newTab) {
        newTab.document.write(`
          <html>
            <head>
              <title>Course Schedule</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { margin: 0; padding: 20px; text-align: center; }
                img { max-width: 100%; height: auto; }
                p { margin: 20px 0; font-family: Arial, sans-serif; }
              </style>
            </head>
            <body>
              <img src="${imgUrl}" alt="Course Schedule">
              <p>Right-click (or long-press on mobile) on the image and select "Save image as..." to download.</p>
            </body>
          </html>
        `)
        newTab.document.close()
      } else {
        alert("Unable to open new tab. Please check your browser settings.")
      }
    }
  } catch (error) {
    console.error("Error exporting schedule as image:", error)
    alert("Failed to export as image. Please try again or use the PDF option.")
  }
}
