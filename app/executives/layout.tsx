"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  getAvailableYears,
  getExecutivesByStudentId,
  getPrimaryRole,
  isStudentId,
} from "@/app/executives/util";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ExecutivesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const segment = pathname.split("/").filter(Boolean).pop();
  const availableYears = getAvailableYears().sort(
    (a, b) => Number.parseInt(b) - Number.parseInt(a)
  );

  const handleYearChange = (year: string) => {
    router.push(`/executives/${year}`);
  };

  const isProfile = Boolean(segment && isStudentId(segment));
  const isIndex = segment === "executives";
  const currentYear = !isProfile && !isIndex ? segment : undefined;

  // On a profile page the person's name is the page's single <h1>, so the
  // section header collapses to a breadcrumb trail instead.
  const profileRole = isProfile
    ? (() => {
        const roles = getExecutivesByStudentId(segment as string);
        return roles.length > 0 ? getPrimaryRole(roles) : undefined;
      })()
    : undefined;

  return (
    <div className="pb-16">
      <div className="bg-muted py-6">
        <div className="container">
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <li className="flex items-center gap-1">
                <Link href="/" className="hover:text-primary transition-colors">
                  Home
                </Link>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </li>
              <li className="flex items-center gap-1">
                {isIndex ? (
                  <span className="text-foreground font-medium">Executives</span>
                ) : (
                  <>
                    <Link
                      href="/executives"
                      className="hover:text-primary transition-colors"
                    >
                      Executives
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </>
                )}
              </li>
              {currentYear && (
                <li className="text-foreground font-medium">{currentYear}</li>
              )}
              {profileRole && (
                <li className="flex items-center gap-1">
                  <Link
                    href={`/executives/${profileRole.year}`}
                    className="hover:text-primary transition-colors"
                  >
                    {profileRole.year}
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-foreground font-medium">
                    {profileRole.name}
                  </span>
                </li>
              )}
            </ol>
          </nav>

          {!isProfile && (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                {currentYear
                  ? `GUCC Executives ${currentYear}`
                  : "GUCC Executives"}
              </h1>
              <p className="text-muted-foreground max-w-[700px] mt-2">
                {currentYear
                  ? `The ${currentYear} executive committee of the Green University Computer Club — faculty advisors and student executives of Green University of Bangladesh.`
                  : "Meet every executive who has led the Green University Computer Club, from the founding committee to today."}
              </p>

              <div className="flex justify-center mt-6 mb-4">
                <div className="max-w-full overflow-x-auto border rounded-lg border-2 border-gray-200 dark:border-white-100">
                  <Tabs
                    value={currentYear}
                    onValueChange={handleYearChange}
                    className="w-full min-w-max"
                  >
                    <TabsList className="w-full min-w-max">
                      {availableYears.map((year) => (
                        <TabsTrigger key={year} value={year}>
                          <span className="hidden md:inline">{year}</span>
                          <span className="md:hidden">{year.slice(-2)}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
