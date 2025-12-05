"use client"

import type { ReactNode } from "react"
import { InfoIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface FeatureTooltipProps {
  content: ReactNode
  children?: ReactNode
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  className?: string
}

export function FeatureTooltip({
  content,
  children,
  side = "top",
  align = "center",
  className = "",
}: FeatureTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center ${className}`}>
            {children || <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />}
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} align={align} className="max-w-xs">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
