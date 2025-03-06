"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  executivesByYear,
  getAvailableYears,
  groupExecutivesByCategory,
  type FacultyMember,
  type StudentExecutive,
} from "@/data/executives"

export default function ExecutivesPage() {
  const availableYears = getAvailableYears().sort((a, b) => Number.parseInt(b) - Number.parseInt(a))
  const [activeYear, setActiveYear] = useState(availableYears[0])

  const currentYearData = executivesByYear.find((exec) => exec.year === activeYear)

  if (!currentYearData) {
    return <div className="container py-12">No data available for the selected year.</div>
  }

  const { facultyMembers, studentExecutives } = currentYearData
  const { leadership, technical, organizational, cultural } = groupExecutivesByCategory(studentExecutives)

  return (
    <div className="container py-12 md:py-24">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">Our Executives</h1>
        <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">Meet the dedicated team behind GUCC</p>
      </div>

      <Tabs defaultValue={activeYear} className="mt-12" onValueChange={setActiveYear}>
        <div className="flex justify-center mb-8">
          <TabsList>
            {availableYears.map((year) => (
              <TabsTrigger key={year} value={year}>
                {year} Committee
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {availableYears.map((year) => (
          <TabsContent key={year} value={year}>
            {executivesByYear.find((exec) => exec.year === year)?.facultyMembers.length > 0 && (
              <section className="mb-12">
                <h2 className="text-2xl font-bold mb-6">Faculty Advisors</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {executivesByYear
                    .find((exec) => exec.year === year)
                    ?.facultyMembers.map((faculty, index) => (
                      <FacultyCard key={index} faculty={faculty} />
                    ))}
                </div>
              </section>
            )}

            <div className="space-y-12">
              <section>
                <h2 className="text-2xl font-bold mb-6">Leadership Team</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {groupExecutivesByCategory(
                    executivesByYear.find((exec) => exec.year === year)?.studentExecutives || [],
                  ).leadership.map((executive, index) => (
                    <ExecutiveCard key={index} executive={executive} />
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-6">Technical Team</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {groupExecutivesByCategory(
                    executivesByYear.find((exec) => exec.year === year)?.studentExecutives || [],
                  ).technical.map((executive, index) => (
                    <ExecutiveCard key={index} executive={executive} />
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-6">Organizational Team</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {groupExecutivesByCategory(
                    executivesByYear.find((exec) => exec.year === year)?.studentExecutives || [],
                  ).organizational.map((executive, index) => (
                    <ExecutiveCard key={index} executive={executive} />
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-6">Cultural & Media Team</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {groupExecutivesByCategory(
                    executivesByYear.find((exec) => exec.year === year)?.studentExecutives || [],
                  ).cultural.map((executive, index) => (
                    <ExecutiveCard key={index} executive={executive} />
                  ))}
                </div>
              </section>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function FacultyCard({ faculty }: { faculty: FacultyMember }) {
  const initials = faculty.name
    .split(" ")
    .map((name) => name[0])
    .join("")
    .substring(0, 2)
    .toUpperCase()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <CardTitle className="text-lg">{faculty.name}</CardTitle>
          <CardDescription>{faculty.position}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{faculty.designation}</p>
      </CardContent>
    </Card>
  )
}

function ExecutiveCard({ executive }: { executive: StudentExecutive }) {
  const initials = executive.name
    .split(" ")
    .map((name) => name[0])
    .join("")
    .substring(0, 2)
    .toUpperCase()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <CardTitle className="text-lg">{executive.name}</CardTitle>
          <CardDescription>{executive.position}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Student ID: {executive.studentId}</p>
      </CardContent>
    </Card>
  )
}

