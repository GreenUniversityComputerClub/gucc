/**
 * Shuffles an array using the Fisher-Yates algorithm
 * @param array The array to shuffle
 * @param options Optional configuration
 * @returns A new shuffled array
 */
export function shuffleArray<T>(
  array: T[],
  options?: {
    /** Provide a seed for reproducible shuffles */
    seed?: number
    /** Use crypto random for higher quality randomness (if available) */
    useCrypto?: boolean
  },
): T[] {
  // Create a copy to avoid modifying the original
  const shuffled = [...array]

  // If array is empty or has only one element, return copy
  if (shuffled.length <= 1) return shuffled

  // Function to get a random number between 0 (inclusive) and max (exclusive)
  const getRandomInt = (max: number): number => {
    // Use crypto random if requested and available
    if (options?.useCrypto && typeof crypto !== "undefined" && crypto.getRandomValues) {
      const randomBuffer = new Uint32Array(1)
      crypto.getRandomValues(randomBuffer)
      return randomBuffer[0] % max
    }

    // Use seeded random if seed is provided
    if (options?.seed !== undefined) {
      // Simple seeded random function
      const seed = (options.seed * 9301 + 49297) % 233280
      options.seed = seed // Update seed for next call
      return Math.floor((seed / 233280) * max)
    }

    // Default to Math.random()
    return Math.floor(Math.random() * max)
  }

  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = getRandomInt(i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

/**
 * Shuffles an array using a cryptographically secure random number generator
 * @param array The array to shuffle
 * @returns A new shuffled array
 */
export function secureShuffleArray<T>(array: T[]): T[] {
  return shuffleArray(array, { useCrypto: true })
}

/**
 * Creates a reproducible shuffle with the same seed always producing the same result
 * @param array The array to shuffle
 * @param seed A number to seed the random generator
 * @returns A new shuffled array
 */
export function seededShuffleArray<T>(array: T[], seed: number): T[] {
  return shuffleArray(array, { seed })
}
