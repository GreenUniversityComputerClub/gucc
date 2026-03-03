"use client"

import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Message {
  text: string
  role: "user" | "model"
  timestamp: Date
}

interface MessageModalProps {
  isOpen: boolean
  onClose: () => void
  message: Message | null
  screenSize: "small" | "medium" | "large"
}

export function MessageModal({ isOpen, onClose, message, screenSize }: MessageModalProps) {
  if (!isOpen || !message) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" aria-hidden="true" />
      <div
        className={cn(
          "bg-white dark:bg-slate-900 relative rounded-lg shadow-xl",
          "w-[95vw] sm:w-[90vw] md:w-[80vw] lg:w-[70vw] xl:w-[60vw]",
          "max-w-3xl max-h-[90vh] flex flex-col",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className={cn(
            "absolute rounded-full transition-colors z-10",
            "right-2 top-2 sm:right-4 sm:top-4 md:right-6 md:top-6",
            "p-1.5 sm:p-2 md:p-2.5 bg-green-100 hover:bg-green-200 dark:bg-slate-800 dark:hover:bg-slate-700",
          )}
          aria-label="Close"
        >
          <X className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 text-green-800 dark:text-green-200" />
        </button>

        {/* Header */}
        <div className="p-3 sm:p-6 md:p-8 pb-0 sm:pb-2 md:pb-4">
          <h2
            className={cn(
              "flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 md:gap-3",
              "text-base sm:text-lg md:text-xl lg:text-2xl font-semibold",
              message.role === "user" ? "text-green-700" : "text-green-800",
            )}
          >
            {message.role === "user" ? "Your Message" : "GUCC Assistant"}
            <span className="text-xs sm:text-sm md:text-base font-normal text-gray-500 dark:text-gray-400">
              {format(message.timestamp, "MMM d, yyyy h:mm a")}
            </span>
          </h2>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-3 sm:p-6 md:p-8 pt-2 sm:pt-2 md:pt-2">
          <div className="text-sm sm:text-base md:text-lg lg:text-xl text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
            {message.text}
          </div>
        </ScrollArea>

        {/* Bottom close button */}
        <div className="p-3 sm:p-6 md:p-8 pt-2 sm:pt-4 md:pt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-green-100 hover:bg-green-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-green-800 dark:text-slate-100 border-green-300 dark:border-slate-700 text-sm sm:text-base md:text-lg py-1.5 sm:py-2 md:py-2.5 h-auto px-4 sm:px-6 md:px-8"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

