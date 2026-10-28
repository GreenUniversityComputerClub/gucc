"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";
import { PageBand, PageHero } from "@/components/page-hero";
import { isStudentId } from "@/app/executives/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface ProfileRole {
  name: string;
  year: string;
}

/** Section header for /executives: breadcrumb, title and year tabs. Data comes from the server layout. */
export function ExecutivesHeader({
  children,
  years,
  profiles,
}: {
  children: React.ReactNode;
  years: string[];
  profiles: Record<string, ProfileRole>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const segment = pathname.split("/").filter(Boolean).pop();
  const availableYears = [...years].sort(
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
  const profileRole = isProfile ? profiles[segment as string] : undefined;

  const breadcrumb = (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 font-mono text-xs uppercase tracking-[0.15em] text-white/60">
        <li className="flex items-center gap-1">
          <Link href="/" className="-my-2.5 inline-block py-2.5 transition-colors hover:text-white">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </li>
        <li className="flex items-center gap-1">
          {isIndex ? (
            <span className="font-medium text-aurora-300">Executives</span>
          ) : (
            <>
              <Link
                href="/executives"
                className="-my-2.5 inline-block py-2.5 transition-colors hover:text-white"
              >
                Executives
              </Link>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </>
          )}
        </li>
        {currentYear && (
          <li className="font-medium text-aurora-300">{currentYear}</li>
        )}
        {profileRole && (
          <li className="flex items-center gap-1">
            <Link
              href={`/executives/${profileRole.year}`}
              className="-my-2.5 inline-block py-2.5 transition-colors hover:text-white"
            >
              {profileRole.year}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-medium text-aurora-300">
              {profileRole.name}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );

  return (
    <div className="pb-16">
      {isProfile ? (
        <PageBand>{breadcrumb}</PageBand>
      ) : (
        <PageHero
          breadcrumb={breadcrumb}
          icon={<Users />}
          eyebrow={currentYear ? `Committee ${currentYear}` : "Since 2016"}
          title={currentYear ? <>GUCC Executives <span className="text-gradient">{currentYear}</span></> : <>GUCC <span className="text-gradient">Executives</span></>}
          description={currentYear
            ? `The ${currentYear} executive committee of the Green University Computer Club — faculty advisors and student executives of Green University of Bangladesh.`
            : "Meet every executive who has led the Green University Computer Club, from the founding committee to today."}
        >
          <div className="glass max-w-full overflow-x-auto rounded-full p-1.5 [scrollbar-width:none]">
            <Tabs
              // Always controlled ("" = no year selected on the index page): switching
              // between undefined and a year made React warn on every navigation.
              value={currentYear ?? ""}
              onValueChange={handleYearChange}
              className="w-full min-w-max"
            >
              <TabsList className="h-auto w-full min-w-max gap-1 rounded-full bg-transparent p-0">
                {availableYears.map((year) => (
                  // The tabs switch pages (there's no tab panel here), so they don't point
                  // at one: a dangling aria-controls is an accessibility error.
                  <TabsTrigger key={year} value={year} aria-controls={undefined}
                    className="h-9 rounded-full px-4 font-mono text-sm text-white/70 transition-colors hover:text-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-brand-400 data-[state=active]:to-aurora-400 data-[state=active]:text-slate-950 data-[state=active]:shadow-[0_0_20px_-4px] data-[state=active]:shadow-brand-400/70">
                    <span className="hidden md:inline">{year}</span>
                    <span className="md:hidden">{year.slice(-2)}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </PageHero>
      )}

      {children}
    </div>
  );
}
