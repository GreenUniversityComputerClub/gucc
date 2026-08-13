import type React from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Suspense } from "react"
import "./schedule.css"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="font-sans">
      <TooltipProvider>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <Suspense>{children}</Suspense>
        </div>
      </TooltipProvider>
    </div>
  )
} 

export const metadata = {
  title: "Course Scheduler",
  description: "Find optimal class combinations with conflict-free schedules",
}
