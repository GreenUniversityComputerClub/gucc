import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { GraduationCap, Users } from "lucide-react";
import {
  getAvailableYears,
  getExecutiveAvatar,
  getLatestExecutiveYear,
  getYearRoster,
  isStudentId,
  type ExecutiveWithYear,
} from "@/app/executives/util";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  breadcrumbSchema,
  collectionPageSchema,
  graph,
  itemListSchema,
  personSchema,
} from "@/lib/seo/schema";

const latestYear = getLatestExecutiveYear();

export const metadata: Metadata = buildMetadata({
  title: `GUCC Executives — Every Committee Since 2016`,
  description: `Meet the executives of the Green University Computer Club. Browse the ${latestYear} executive committee — President, General Secretary, Treasurer and every other role — plus the full archive of past GUCC committees and faculty advisors.`,
  path: "/executives",
  keywords: [
    "GUCC executives",
    "GUCC executive committee",
    "GUCC president",
    "GUCC general secretary",
    "Green University Computer Club committee",
    "Green University Computer Club executives",
    "GUCC panel",
    "GUCC members",
    `GUCC executives ${latestYear}`,
  ],
  image: {
    eyebrow: "Executive Committee",
    title: "GUCC Executives",
    subtitle: `Every committee of the Green University Computer Club since 2016`,
  },
});

function profilePath(person: ExecutiveWithYear): string | undefined {
  return person.studentId && isStudentId(person.studentId)
    ? `/executives/${person.studentId}`
    : undefined;
}

function PersonCard({ person }: { person: ExecutiveWithYear }) {
  const avatar = getExecutiveAvatar(person);
  const href = profilePath(person);

  const inner = (
    <article className="group flex h-full flex-col items-center rounded-xl border bg-card p-6 text-center transition-shadow hover:shadow-lg">
      <div className="relative mb-4 h-28 w-28 overflow-hidden rounded-full border-4 border-primary/20 bg-muted">
        {avatar ? (
          <Image
            src={avatar}
            alt={`${person.name} — ${person.position}, GUCC ${person.year}`}
            fill
            sizes="112px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
            {person.name.slice(0, 1)}
          </div>
        )}
      </div>
      <h3 className="text-lg font-semibold leading-tight group-hover:text-primary">
        {person.name}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{person.position}</p>
      {person.designation && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {person.designation}
        </p>
      )}
    </article>
  );

  return href ? (
    <Link href={href} className="h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default function ExecutivesIndexPage() {
  const years = getAvailableYears().sort(
    (a, b) => Number.parseInt(b) - Number.parseInt(a)
  );
  const current = getYearRoster(latestYear);
  const currentRoster = [
    ...(current?.facultyMembers ?? []),
    ...(current?.studentExecutives ?? []),
  ];

  const structuredData = graph(
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Executives", path: "/executives" },
    ]),
    collectionPageSchema({
      name: `GUCC Executives — Executive Committees of the Green University Computer Club`,
      description: `The complete directory of Green University Computer Club executives, including the ${latestYear} executive committee and every past committee.`,
      path: "/executives",
      list: itemListSchema(
        `GUCC Executive Committee ${latestYear}`,
        currentRoster.map((person) => ({
          name: person.name,
          path: profilePath(person),
          image: getExecutiveAvatar(person),
          node: personSchema({
            name: person.name,
            path: profilePath(person),
            position: person.position,
            designation: person.designation,
            image: getExecutiveAvatar(person),
            year: person.year,
            sameAs: [
              person.linkedin,
              person.github,
              person.facebook,
              person.twitter,
            ],
          }),
        }))
      ),
    })
  );

  return (
    <div className="container py-8">
      <JsonLd id="executives-index-schema" data={structuredData} />

      <section aria-labelledby="current-committee">
        <h2
          id="current-committee"
          className="mb-2 flex items-center gap-2 text-2xl font-bold"
        >
          <Users className="h-6 w-6 text-primary" />
          Executive Committee {latestYear}
        </h2>
        <p className="mb-6 max-w-3xl text-muted-foreground">
          The {latestYear} executive committee of the Green University Computer
          Club (GUCC) — the flagship student-run technology club of Green
          University of Bangladesh, operating with the Department of Computer
          Science and Engineering. Select any executive to view their full
          profile and the positions they have held.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {currentRoster.map((person, index) => (
            <PersonCard key={`${person.studentId ?? person.name}-${index}`} person={person} />
          ))}
        </div>

        <div className="mt-6">
          <Link
            href={`/executives/${latestYear}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            View the full {latestYear} committee by campus →
          </Link>
        </div>
      </section>

      {/* Archive — one linked entry per executive so every profile is crawlable. */}
      <section aria-labelledby="committee-archive" className="mt-16">
        <h2
          id="committee-archive"
          className="mb-2 flex items-center gap-2 text-2xl font-bold"
        >
          <GraduationCap className="h-6 w-6 text-primary" />
          Past Executive Committees
        </h2>
        <p className="mb-8 max-w-3xl text-muted-foreground">
          Every GUCC executive committee on record, newest first.
        </p>

        <div className="space-y-10">
          {years
            .filter((year) => year !== latestYear)
            .map((year) => {
              const roster = getYearRoster(year);
              const people = [
                ...(roster?.facultyMembers ?? []),
                ...(roster?.studentExecutives ?? []),
              ];
              if (people.length === 0) return null;

              return (
                <div key={year}>
                  <h3 className="mb-3 text-xl font-semibold">
                    <Link
                      href={`/executives/${year}`}
                      className="hover:text-primary"
                    >
                      GUCC Executive Committee {year}
                    </Link>
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {people.map((person, index) => {
                      const href = profilePath(person);
                      const label = `${person.name} — ${person.position}`;
                      return (
                        <li key={`${year}-${person.studentId ?? person.name}-${index}`}>
                          {href ? (
                            <Link
                              href={href}
                              className="inline-flex rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
                              title={label}
                            >
                              <span className="font-medium">{person.name}</span>
                              <span className="ml-1.5 text-muted-foreground">
                                {person.position}
                              </span>
                            </Link>
                          ) : (
                            <span className="inline-flex rounded-full border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {person.name}
                              </span>
                              <span className="ml-1.5">{person.position}</span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}
