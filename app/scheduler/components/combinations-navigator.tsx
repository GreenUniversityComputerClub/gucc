"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface CombinationsNavigatorProps {
  totalCombinations: number
  currentIndex: number
  onNavigate: (index: number) => void
}

export default function CombinationsNavigator({
  totalCombinations,
  currentIndex,
  onNavigate,
}: CombinationsNavigatorProps) {
  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 sm:h-9 sm:w-9 border-green-500"
        onClick={() => onNavigate(currentIndex - 1)}
        disabled={currentIndex <= 0}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
        Use ← → arrow keys to navigate between combinations
      </div>
      <div className="text-xs sm:text-sm text-muted-foreground sm:hidden">
        Combination {totalCombinations > 0 ? currentIndex + 1 : 0} of {totalCombinations}
      </div>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 sm:h-9 sm:w-9 border-green-500"
        onClick={() => onNavigate(currentIndex + 1)}
        disabled={currentIndex >= totalCombinations - 1}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
