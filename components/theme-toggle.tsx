"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

/** Day or night. Follows what's on screen (also when the theme comes from the device's setting). */
export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  // useEffect only runs on the client, so now we can safely show the UI
  React.useEffect(() => {
    setMounted(true)
  }, [])

  const dark = resolvedTheme !== "light"
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-10 w-10 rounded-full"
      disabled={!mounted}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={mounted ? (dark ? "Switch to day mode" : "Switch to night mode") : "Toggle theme"}
      title={mounted ? (dark ? "Day mode" : "Night mode") : undefined}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" aria-hidden />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" aria-hidden />
    </Button>
  )
}
