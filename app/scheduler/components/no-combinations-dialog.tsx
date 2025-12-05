"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertCircle, Calendar, Info } from "lucide-react"

interface NoCombinationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  errorMessage: string
  selectedCourseCodes: string[]
  selectedDays: string[]
  maxDays: number
}

export default function NoCombinationsDialog({
  open,
  onOpenChange,
  errorMessage,
  selectedCourseCodes,
  selectedDays,
  maxDays,
}: NoCombinationsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <DialogTitle className="text-center text-xl font-semibold mt-4">No Valid Combinations Found</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <p className="text-center text-muted-foreground">{errorMessage}</p>

          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <h3 className="font-medium flex items-center gap-2 mb-3">
              <Info className="h-4 w-4 text-primary" />
              Current Configuration
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Selected Courses ({selectedCourseCodes.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selectedCourseCodes.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-muted-foreground mb-1">Preferred Days ({selectedDays.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selectedDays.length > 0 ? (
                    selectedDays.map((day) => (
                      <span
                        key={day}
                        className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
                      >
                        {day}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No days selected</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-muted-foreground mb-1">Exact Days</p>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Exactly {maxDays} days</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-accent p-4">
            <h3 className="font-medium mb-2">Suggestions</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-accent-foreground">
              <li>Try changing the number of exact days</li>
              <li>Select more preferred days</li>
              <li>Remove some courses with conflicting schedules</li>
              <li>Check if your selected courses have sections on your preferred days</li>
            </ul>
          </div>

          <div className="flex justify-center">
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
