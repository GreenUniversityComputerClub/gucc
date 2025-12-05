"use client"

import { useEffect, useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface LoadingDialogProps {
  open: boolean
  message?: string
}

export default function LoadingDialog({ open, message = "Generating combinations..." }: LoadingDialogProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  // Set up the timer when the dialog opens
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (open) {
      // Reset timer state
      setElapsedTime(0)
      startTimeRef.current = Date.now()

      // Create a new interval that updates every 1000ms (1 second)
      intervalRef.current = setInterval(() => {
        const currentTime = Date.now()
        const elapsedSeconds = Math.floor((currentTime - startTimeRef.current) / 1000)
        setElapsedTime(elapsedSeconds)
      }, 1000)
    }

    // Cleanup function to clear the interval when component unmounts or dialog closes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [open])

  // Format the elapsed time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[425px] text-center">
        <DialogHeader>
          <DialogTitle className="sr-only">Generating combinations</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center gap-6 py-4">
          <div className="relative mt-2">
            <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent loading-spinner" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-lg font-medium">{message}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              This may take a moment depending on the number of courses and sections.
            </p>
            <div className="mt-4 text-sm font-mono">Time elapsed: {formatTime(elapsedTime)}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
