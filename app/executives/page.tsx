"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  executivesByYear,
  getAvailableYears,
  type FacultyMember,
  type StudentExecutive,
} from "@/data/executives";
import {
  BookOpen,
  Building2,
  Camera,
  Code2,
  Crown,
  GraduationCap,
  UserCog,
  Users,
} from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import executiveImage from "../assets/executives/221902012.png";

export default function ExecutivesPage() {
  const availableYears = getAvailableYears().sort(
    (a, b) => Number.parseInt(b) - Number.parseInt(a)
  );
  const [activeYear, setActiveYear] = useState(availableYears[0]);

  const currentYearData = executivesByYear.find(
    (exec) => exec.year === activeYear
  );

  if (!currentYearData) {
    return (
      <div className="container py-12">
        No data available for the selected year.
      </div>
    );
  }

  return (
    <div className="container py-4 md:py-8">
      <p className="text-center mx-auto max-w-[700px] text-muted-foreground md:text-lg">
        Meet the dedicated team behind GUCC
      </p>

      <Tabs
        defaultValue={activeYear}
        className="mt-8"
        onValueChange={setActiveYear}
      >
        <div className="flex justify-center mb-4">
          <TabsList>
            {availableYears.map((year) => (
              <TabsTrigger key={year} value={year}>
                {year}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {availableYears.map((year) => {
          const yearData = executivesByYear.find((exec) => exec.year === year);
          const facultyMembers = yearData?.facultyMembers || [];

          return (
            <TabsContent key={year} value={year}>
              {facultyMembers.length > 0 && (
                <section className="mb-12">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <GraduationCap className="h-6 w-6 text-primary" />
                    Faculty Advisors
                  </h2>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {facultyMembers.map((faculty, index) => (
                      <FacultyCard key={index} faculty={faculty} />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  Student Executives
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {(yearData?.studentExecutives || []).map(
                    (executive, index) => (
                      <ExecutiveCard key={index} executive={executive} />
                    )
                  )}
                </div>
              </section>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function FacultyCard({ faculty }: { faculty: FacultyMember }) {
  const initials = faculty.name
    .split(" ")
    .map((name) => name[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            {faculty.name}
          </CardTitle>
          <CardDescription>{faculty.position}</CardDescription>
        </div>
      </CardHeader>
      {/* <CardContent>
        <p className="text-sm text-muted-foreground">{faculty.designation}</p>
      </CardContent> */}
    </Card>
  );
}

function ExecutiveCard({ executive }: { executive: StudentExecutive }) {
  const initials = executive.name
    .split(" ")
    .map((name) => name[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <Card className="relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <div className="relative">
        <CardHeader className="flex flex-row items-center gap-4 relative">
          <div className="absolute -right-8 -top-8 w-40 h-40 opacity-80 group-hover:opacity-100 transition-opacity">
            {executive.studentId && (
              <Image
                src={`/executives/${executive.studentId}.png`}
                alt={executive.name}
                width={160}
                height={160}
                className="object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                }}
              />
            )}
          </div>
          <div className="relative z-10">
            <CardTitle className="text-lg flex items-center gap-2">
              {getRoleIcon(executive.position)}
              {executive.name}
            </CardTitle>
            <CardDescription>{getRoleName(executive.position)}</CardDescription>
          </div>
        </CardHeader>
      </div>
    </Card>
  );
}

function getRoleIcon(position: string) {
  const positionLower = position.toLowerCase();
  if (positionLower.includes("president"))
    return <Crown className="h-5 w-5 text-primary" />;
  if (positionLower.includes("programming"))
    return <Code2 className="h-5 w-5 text-primary" />;
  if (
    positionLower.includes("organizational") ||
    positionLower.includes("coordinator")
  )
    return <Users className="h-5 w-5 text-primary" />;
  if (positionLower.includes("cultural") || positionLower.includes("media"))
    return <Camera className="h-5 w-5 text-primary" />;
  if (positionLower.includes("academic"))
    return <BookOpen className="h-5 w-5 text-primary" />;
  if (positionLower.includes("admin"))
    return <Building2 className="h-5 w-5 text-primary" />;

  return <UserCog className="h-5 w-5 text-primary" />;
};

function getRoleName(position: string) {
  return position.replace('Development', 'Dev')
  
}
