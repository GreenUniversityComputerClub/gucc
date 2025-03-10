import executivesData from "../../data/executives.json";

export interface Executive {
  position: string
  name: string
  studentId?: string
  avatarUrl?: string
  avatarPosition?: { x: number, y: number }
  avatarScale?: number
  linkedin?: string;
  github?: string;
  twitter?: string;
  facebook?: string;
  mail?: string;
}

export interface ExecutiveYear {
  year: string
  facultyMembers: Executive[]
  studentExecutives: Executive[]
}


// Helper function to get executives for a specific year
export function getExecutivesByYear(year: string): ExecutiveYear | undefined {
  return executivesData.find((exec) => exec.year === year)
}

// Helper function to get all available years
export function getAvailableYears(): string[] {
  return executivesData.map((exec) => exec.year)
}

// Helper function to group student executives by category
export function groupExecutivesByCategory(executives: Executive[]) {
  const moderator = executives.filter((exec) =>
    ["Moderator", "Deputy Moderator"].some((title) =>
      exec.position.includes(title),
    ),
  )
  const leadership = executives.filter((exec) =>
    ["President", "Vice President", "General Secretary", "Joint General Secretary"].some((title) =>
      exec.position.includes(title),
    ),
  )

  const technical = executives.filter((exec) =>
    ["Programming", "Technical", "Development", "Information"].some((title) => exec.position.includes(title)),
  )

  const organizational = executives.filter((exec) =>
    ["Organizing", "Event", "Treasurer", "Outreach", "Publication"].some((title) => exec.position.includes(title)),
  )

  const cultural = executives.filter((exec) =>
    ["Cultural", "Graphics", "Media", "Photography", "Sports", "Executive Member"].some((title) =>
      exec.position.includes(title),
    ),
  )

  return { leadership, technical, organizational, cultural }
}

