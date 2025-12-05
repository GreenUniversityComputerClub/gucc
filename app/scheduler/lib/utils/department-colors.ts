// Function to get the department code from a course code
export function getDepartmentCode(courseCode: string | null | undefined): string {
  // Check if courseCode is defined and is a string
  if (!courseCode || typeof courseCode !== "string") {
    return "other"
  }

  // Extract the department code (e.g., "CSE", "EEE", "MAT", etc.)
  const match = courseCode.match(/^([A-Z]+)/)
  return match ? match[1].toLowerCase() : "other"
}

// Function to extract batch number from section ID
export function getBatchFromSectionId(sectionId: string): string | null {
  const match = sectionId.match(/^(\d+)/)
  return match ? match[1] : null
}

// Map of department codes to color classes (defined once to avoid recreating on each render)
const DEPT_COLOR_MAP: Record<string, string> = {
  cse: "dept-cse",
  eee: "dept-eee",
  ged: "dept-ged",
  mat: "dept-mat",
  phy: "dept-phy",
  esp: "dept-esp",
  che: "dept-che",
}

const DEPT_CARD_MAP: Record<string, string> = {
  cse: "dept-card-cse",
  eee: "dept-card-eee",
  ged: "dept-card-ged",
  mat: "dept-card-mat",
  phy: "dept-card-phy",
  esp: "dept-card-esp",
  che: "dept-card-che",
}

const DEPT_BG_MAP: Record<string, string> = {
  cse: "bg-dept-cse-light",
  eee: "bg-dept-eee-light",
  ged: "bg-dept-ged-light",
  mat: "bg-dept-mat-light",
  phy: "bg-dept-phy-light",
  esp: "bg-dept-esp-light",
  che: "bg-dept-che-light",
}

const DEPT_TEXT_MAP: Record<string, string> = {
  cse: "text-dept-cse-dark",
  eee: "text-dept-eee-dark",
  ged: "text-dept-ged-dark",
  mat: "text-dept-mat-dark",
  phy: "text-dept-phy-dark",
  esp: "text-dept-esp-dark",
  che: "text-dept-che-dark",
}

const DEPT_BORDER_MAP: Record<string, string> = {
  cse: "border-dept-cse",
  eee: "border-dept-eee",
  ged: "border-dept-ged",
  mat: "border-dept-mat",
  phy: "border-dept-phy",
  esp: "border-dept-esp",
  che: "border-dept-che",
}

const CREDIT_INDICATOR_MAP: Record<string, string> = {
  "1": "credit-indicator-1",
  "1.5": "credit-indicator-1-5",
  "2": "credit-indicator-2",
  "3": "credit-indicator-3",
  "4": "credit-indicator-4",
}

const COURSE_BLOCK_SIZE_MAP: Record<string, string> = {
  "1": "course-block-1",
  "1.5": "course-block-1-5",
  "2": "course-block-2",
  "3": "course-block-3",
  "4": "course-block-4",
}

// Function to get the appropriate color class for a department
export function getDepartmentColorClass(courseCode: string): string {
  const deptCode = getDepartmentCode(courseCode)
  return DEPT_COLOR_MAP[deptCode] || "dept-other"
}

// Function to get the appropriate card class for a department
export function getDepartmentCardClass(courseCode: string): string {
  const deptCode = getDepartmentCode(courseCode)
  return DEPT_CARD_MAP[deptCode] || ""
}

// Function to get the appropriate background color for a department
export function getDepartmentBgColor(courseCode: string): string {
  const deptCode = getDepartmentCode(courseCode)
  return DEPT_BG_MAP[deptCode] || "bg-gray-100"
}

// Function to get the appropriate text color for a department
export function getDepartmentTextColor(courseCode: string): string {
  const deptCode = getDepartmentCode(courseCode)
  return DEPT_TEXT_MAP[deptCode] || "text-gray-800"
}

// Function to get the appropriate border color for a department
export function getDepartmentBorderColor(courseCode: string): string {
  const deptCode = getDepartmentCode(courseCode)
  return DEPT_BORDER_MAP[deptCode] || "border-gray-300"
}

// Function to get credit indicator class based on credits
export function getCreditIndicatorClass(credits: number): string {
  return CREDIT_INDICATOR_MAP[credits.toString()] || "credit-indicator-1"
}

// Function to get course block size class based on credits
export function getCourseBlockSizeClass(credits: number): string {
  return COURSE_BLOCK_SIZE_MAP[credits.toString()] || "course-block-1"
}
