"use client"

import { useState, useEffect } from "react"

export function useMediaQuery(query: string): boolean {
  // Start with a default value to avoid hydration mismatch
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    // Check if window is defined (client-side)
    if (typeof window !== "undefined") {
      // Set initial value based on current window size
      const media = window.matchMedia(query)
      setMatches(media.matches)

      // Define listener function
      const listener = (event: MediaQueryListEvent) => {
        setMatches(event.matches)
      }

      // Add listener
      media.addEventListener("change", listener)

      // Clean up
      return () => {
        media.removeEventListener("change", listener)
      }
    }

    // Default to false on server-side
    return () => {}
  }, [query])

  return matches
}
