/**
 * Generates an acronym from a course title
 * @param title The course title
 * @returns The generated acronym
 */
export function generateAcronym(title: string): string {
  // Words to exclude from acronym
  const excludeWords = ["and", "of", "the", "for", "in", "to", "with", "a", "an"]

  // Split the title into words and filter out excluded words
  const words = title.split(" ").filter((word) => word.length > 0 && !excludeWords.includes(word.toLowerCase()))

  // Generate acronym by taking the first letter of each word
  let acronym = words.map((word) => word[0].toUpperCase()).join("")

  // If acronym is too short (less than 2 characters), use a different approach
  if (acronym.length < 2) {
    acronym = title
      .split(" ")
      .filter((word) => word.length > 0)
      .map((word) => word[0].toUpperCase())
      .join("")
  }

  return acronym
}
