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
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" aria-hidden="true" />
      <div
        className={cn(
          "bg-zinc-950 border border-zinc-800 text-zinc-100 relative rounded-2xl shadow-2xl",
          "w-[95vw] sm:w-[90vw] md:w-[70vw] lg:w-[60vw] xl:w-[50vw]",
          "max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-full border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="p-5 pb-3">
          <h2 className="flex flex-col sm:flex-row sm:items-center gap-2 text-base sm:text-lg font-bold">
            <span className={message.role === "user" ? "text-emerald-400" : "text-white"}>
              {message.role === "user" ? "Your Message" : "GUCC Assistant"}
            </span>
            <span className="text-xs font-normal text-zinc-500">
              {format(message.timestamp, "MMM d, yyyy h:mm a")}
            </span>
          </h2>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-5 pt-1">
          <div className="text-xs sm:text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {message.text}
          </div>
        </ScrollArea>

        {/* Bottom close button */}
        <div className="p-4 border-t border-zinc-900 flex justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-800 text-xs py-2 h-9 px-4 rounded-xl transition-all"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

