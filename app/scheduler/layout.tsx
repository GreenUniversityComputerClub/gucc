import type React from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Inter } from "next/font/google"
import { Suspense } from "react"
import "./schedule.css"

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={inter.className}>
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
