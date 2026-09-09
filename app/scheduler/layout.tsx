import type React from "react"
import type { Metadata } from "next"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Suspense } from "react"
import { buildMetadata } from "@/lib/seo/metadata"
import { JsonLd } from "@/components/seo/json-ld"
import { breadcrumbSchema, graph } from "@/lib/seo/schema"
import "./schedule.css"

export const metadata: Metadata = buildMetadata({
  title: "Course Scheduler — Green University Routine Planner",
  description:
    "Free course routine planner for Green University of Bangladesh students. Pick your courses and the GUCC scheduler generates every conflict-free class combination, then exports your routine as an image or PDF.",
  path: "/scheduler",
  keywords: [
    "Green University course scheduler",
    "GUB routine",
    "GUB class routine maker",
    "course routine planner Bangladesh",
    "GUCC scheduler",
    "conflict free class schedule",
  ],
  image: {
    eyebrow: "Free Tool",
    title: "Course Scheduler",
    subtitle: "Conflict-free class combinations for GUB students",
  },
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="font-sans">
      <JsonLd
        id="scheduler-schema"
        data={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Course Scheduler", path: "/scheduler" },
          ]),
          {
            "@type": "WebApplication",
            name: "GUCC Course Scheduler",
            url: "https://gucc.green.edu.bd/scheduler",
            applicationCategory: "EducationalApplication",
            operatingSystem: "Any",
            description:
              "Free course routine planner for Green University of Bangladesh students: generates every conflict-free class combination and exports the result.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "BDT" },
          }
        )}
      />
      <TooltipProvider>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <Suspense>{children}</Suspense>
        </div>
      </TooltipProvider>
    </div>
  )
}
