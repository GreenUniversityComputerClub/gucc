"use client"

import { useState, useCallback, memo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { MessageCircle, Computer } from "lucide-react"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import { usePathname } from "next/navigation"
import { useExclusiveOverlay } from "@/lib/overlay"

// Dynamically import the Chatbot component with no SSR to avoid hydration issues
const Chatbot = dynamic(() => import("./chatbot"), { ssr: false })

function FloatingChatbot() {
  // One surface at a time: opening the assistant closes the site and dashboard menus, and back.
  const [isOpen, setIsOpen] = useExclusiveOverlay("chatbot")
  const pathname = usePathname()
  // Members' own conversations (and the dashboard's sticky bars on phones) need that corner.
  const hidden = pathname.startsWith("/dashboard/chat") || pathname.startsWith("/dashboard/notifications")
  const dashboard = pathname.startsWith("/dashboard")
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const openButtonRef = useRef<HTMLButtonElement>(null)

  // Wait until mounted on client to prevent hydration mismatches
  useEffect(() => {
    setMounted(true)
  }, [])

  // Invert chatbot theme: Light theme in dark mode, Dark theme in light mode
  const isChatbotDark = mounted ? resolvedTheme === "light" : false

  // Memoize the open/close handlers to prevent unnecessary re-renders
  const handleOpen = useCallback(() => setIsOpen(true), [setIsOpen])
  const handleClose = useCallback(() => {
    setIsOpen(false)
    // Back to the button that opened it, for keyboard users.
    requestAnimationFrame(() => openButtonRef.current?.focus())
  }, [setIsOpen])

  // Following a link (from an answer or the page) closes the chat.
  const firstPath = useRef(pathname)
  useEffect(() => {
    if (firstPath.current === pathname) return
    firstPath.current = pathname
    setIsOpen(false)
  }, [pathname, setIsOpen])

  // Escape closes the chat (unless a message is open in full; that closes first).
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-chat-message-modal]")) handleClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, handleClose])

  // Sizes follow the screen with CSS breakpoints (phone < 640px, tablet < 1024px, desktop), so the
  // first paint is already right on every device.
  if (hidden) return null

  return (
    <>
      {/* Floating chat button */}
      <Button
        ref={openButtonRef}
        onClick={handleOpen}
        className={cn(
          "fixed rounded-full shadow-2xl z-50",
          "flex items-center justify-center",
          "bg-emerald-600 text-white hover:bg-emerald-500 transition-all duration-300",
          "bottom-4 right-4 w-12 h-12 gap-1 sm:bottom-6 sm:right-6 sm:w-14 sm:h-14 sm:gap-1.5 lg:bottom-8 lg:right-8 lg:w-16 lg:h-16 lg:gap-2",
          // On the dashboard the assistant waits for larger screens, where it doesn't cover forms.
          dashboard && "hidden lg:flex",
          isOpen ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100",
        )}
        aria-label="Open chat"
        aria-expanded={isOpen}
        tabIndex={isOpen ? -1 : undefined}
      >
        <Computer className="hidden sm:block h-4 w-4 lg:h-5 lg:w-5" />
        <MessageCircle className="h-5 w-5 sm:h-5.5 sm:w-5.5 lg:h-6 lg:w-6" />
      </Button>

      {/* Floating Chatbot Container */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="GUCC Assistant chat"
          className={cn(
            "fixed z-50 shadow-2xl overflow-hidden flex flex-col transition-all duration-300",
            "animate-in fade-in slide-in-from-bottom-5 duration-200",
            isChatbotDark
              ? "border border-emerald-950/40 bg-[#07140e] text-zinc-100"
              : "border border-emerald-100 bg-[#f4faf7] text-zinc-900",
            // dvh: the on-screen keyboard shrinks the chat instead of covering its input.
            "bottom-4 right-4 left-4 h-[500px] max-h-[80dvh] rounded-2xl",
            "sm:left-auto sm:bottom-6 sm:right-6 sm:w-[340px] sm:h-[520px] sm:max-h-[85dvh]",
            "lg:bottom-8 lg:right-8 lg:w-[380px] lg:h-[480px]",
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
