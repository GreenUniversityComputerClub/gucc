/**
 * Capitalizes a string (first letter uppercase, rest lowercase)
 */
export function capitalize(str: string): string {
  if (!str) return ""
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Capitalizes each word in a string
 */
export function capitalizeWords(str: string): string {
  if (!str) return ""
  return str.split(" ").map(capitalize).join(" ")
}

/**
 * Formats a teacher name for display
 * Handles dot notation (e.g., "john.doe" -> "John.DOE")
 * Parts after the dot are fully capitalized
 */
export function formatTeacherName(name: string | null): string {
  if (!name) return "TBA"
  if (name.toLowerCase() === "tba") return "TBA"

  const parts = name.split(".")

  // Capitalize first part normally
  const firstPart = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()

  // Fully capitalize remaining parts
  const remainingParts = parts.slice(1).map((part) => part.toUpperCase())

  return [firstPart, ...remainingParts].join(".")
}
