"use client"

import { useState, useCallback, memo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { MessageCircle, Computer } from "lucide-react"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"

// Dynamically import the Chatbot component with no SSR to avoid hydration issues
const Chatbot = dynamic(() => import("./chatbot"), { ssr: false })

function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [screenSize, setScreenSize] = useState<"small" | "medium" | "large">("medium")
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Wait until mounted on client to prevent hydration mismatches
  useEffect(() => {
    setMounted(true)
  }, [])

  // Invert chatbot theme: Light theme in dark mode, Dark theme in light mode
  const isChatbotDark = mounted ? resolvedTheme === "light" : false

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth < 640) {
        setScreenSize("small")
      } else if (window.innerWidth < 1024) {
        setScreenSize("medium")
      } else {
        setScreenSize("large")
      }
    }

    // Initial check
    checkScreenSize()

    // Add event listener for window resize
    window.addEventListener("resize", checkScreenSize)

    // Cleanup
    return () => window.removeEventListener("resize", checkScreenSize)
  }, [])

  // Memoize the open/close handlers to prevent unnecessary re-renders
  const handleOpen = useCallback(() => setIsOpen(true), [])
  const handleClose = useCallback(() => setIsOpen(false), [])

  return (
    <>
      {/* Floating chat button */}
      <Button
        onClick={handleOpen}
        className={cn(
          "fixed rounded-full shadow-2xl z-50",
          "flex items-center justify-center",
          "bg-emerald-600 text-white hover:bg-emerald-500 transition-all duration-300",
          screenSize === "small"
            ? "bottom-4 right-4 w-12 h-12 gap-1"
            : screenSize === "medium"
              ? "bottom-6 right-6 w-14 h-14 gap-1.5"
              : "bottom-8 right-8 w-16 h-16 gap-2",
          isOpen ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100",
        )}
        aria-label="Open chat"
      >
        {screenSize !== "small" && <Computer className={cn(screenSize === "medium" ? "h-4 w-4" : "h-5 w-5")} />}
        <MessageCircle
          className={cn(screenSize === "small" ? "h-5 w-5" : screenSize === "medium" ? "h-5.5 w-5.5" : "h-6 w-6")}
        />
      </Button>

      {/* Floating Chatbot Container */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 shadow-2xl overflow-hidden flex flex-col transition-all duration-300",
            "animate-in fade-in slide-in-from-bottom-5 duration-200",
            isChatbotDark
              ? "border border-emerald-950/40 bg-[#07140e] text-zinc-100"
              : "border border-emerald-100 bg-[#f4faf7] text-zinc-900",
            screenSize === "small"
              ? "bottom-4 right-4 left-4 h-[500px] max-h-[80vh] rounded-2xl"
              : screenSize === "medium"
                ? "bottom-6 right-6 w-[340px] h-[520px] max-h-[85vh] rounded-2xl"
                : "bottom-8 right-8 w-[380px] h-[480px] max-h-[85vh] rounded-2xl",
          )}
        >
          <Chatbot onClose={handleClose} isChatbotDark={isChatbotDark} />
        </div>
      )}
    </>
  )
}

// Memoize the entire component to prevent unnecessary re-renders
export default memo(FloatingChatbot)



