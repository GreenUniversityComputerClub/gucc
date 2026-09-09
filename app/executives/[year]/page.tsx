import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getAllExecutiveStudentIds,
  getAvailableYears,
  getExecutiveAvatar,
  getExecutivesByStudentId,
  getExecutivesByYear,
  getPrimaryRole,
  getYearRoster,
  isStudentId,
  type ExecutiveWithYear,
} from "@/app/executives/util";
import { CampusTabs, AdminPanel, ExecutiveProfile } from "./components";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { PARENT_ORGANIZATION, SITE } from "@/lib/seo/site";
import {
  breadcrumbSchema,
  collectionPageSchema,
  graph,
  itemListSchema,
  personSchema,
  profilePageSchema,
} from "@/lib/seo/schema";

// Generate static params for available committee years; individual student profiles render on-demand
export async function generateStaticParams() {
  return getAvailableYears().map((year) => ({ year }));
}

function profilePath(person: { studentId?: string }): string | undefined {
  return person.studentId && isStudentId(person.studentId)
    ? `/executives/${person.studentId}`
    : undefined;
}

/** Every role a person has held, most recent first: "President (2026)". */
function roleSummary(roles: ExecutiveWithYear[]): string {
  return roles
    .slice()
    .sort((a, b) => Number.parseInt(b.year) - Number.parseInt(a.year))
    .map((role) => `${role.position} (${role.year})`)
    .join(", ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<Metadata> {
  const { year } = await params;

  // ── Individual executive profile ──────────────────────────────────────
  if (isStudentId(year)) {
    const roles = getExecutivesByStudentId(year);
    if (roles.length === 0) {
      return buildMetadata({
        title: "Executive not found",
        description: "This GUCC executive profile could not be found.",
        path: `/executives/${year}`,
        noIndex: true,
      });
    }

    const primary = getPrimaryRole(roles);
    const avatar = getExecutiveAvatar(primary);
    const title = `${primary.name} — ${primary.position}, GUCC ${primary.year}`;
    const description = `${primary.name} served as ${roleSummary(roles)} at the Green University Computer Club (GUCC), ${PARENT_ORGANIZATION.name}. View the full executive profile, roles and social links.`;

    return {
      ...buildMetadata({
        title,
        description,
        path: `/executives/${year}`,
        type: "profile",
        keywords: [
          primary.name,
          `${primary.name} GUCC`,
          `${primary.name} Green University`,
          `GUCC ${primary.position}`,
          `GUCC ${primary.position} ${primary.year}`,
          "GUCC executive",
          "Green University Computer Club",
        ],
        image: {
          eyebrow: `GUCC ${primary.year}`,
          title: primary.name,
          subtitle: primary.position,
          photo: avatar,
          variant: "portrait",
        },
      }),
      other: {
        // Read by some social and people-search crawlers.
        "profile:username": year,
      },
    };
  }

  // ── Committee year page ───────────────────────────────────────────────
  const roster = getYearRoster(year);
  if (!roster) {
    return buildMetadata({
      title: "Committee not found",
      description: "This GUCC executive committee year could not be found.",
      path: `/executives/${year}`,
      noIndex: true,
    });
  }

  // Leading the description with real names is what puts them in the snippet;
  // capped so Google shows the whole thing rather than truncating it.
  const highlights = roster.studentExecutives
    .filter((person) => /^(President|General Secretary)$/i.test(person.position))
    .slice(0, 2)
    .map((person) => `${person.position} ${person.name}`)
    .join(", ");

  const total = roster.studentExecutives.length + roster.facultyMembers.length;
  const description = `The ${year} executive committee of the Green University Computer Club (GUCC) at ${PARENT_ORGANIZATION.name}${highlights ? ` — ${highlights}` : ""}. All ${total} faculty advisors and student executives, with photos and profiles.`;

  return buildMetadata({
    title: `GUCC Executives ${year} — Executive Committee`,
    description:
      description.length > 300 ? `${description.slice(0, 297).trimEnd()}…` : description,
    path: `/executives/${year}`,
    keywords: [
      `GUCC executives ${year}`,
      `GUCC committee ${year}`,
      `GUCC panel ${year}`,
      "GUCC executive committee",
      "Green University Computer Club executives",
      "GUCC president",
      "GUCC general secretary",
    ],
    image: {
      eyebrow: `Executive Committee ${year}`,
      title: `GUCC Executives ${year}`,
      subtitle: `${total} faculty advisors and student executives`,
    },
  });
}

export default async function ExecutivesYearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year } = await params;

  // Check if the parameter is a 9-digit student ID
  if (isStudentId(year)) {
    const executives = getExecutivesByStudentId(year);

    // If no executives found with this student ID, show 404
    if (executives.length === 0) {
      notFound();
    }

    const primary = getPrimaryRole(executives);
    const person = {
      name: primary.name,
      path: `/executives/${year}`,
      position: primary.position,
      designation: primary.designation,
      image: getExecutiveAvatar(primary),
      year: primary.year,
      description: `${primary.name} — ${roleSummary(executives)} at the ${SITE.name} (${SITE.shortName}), ${PARENT_ORGANIZATION.name}.`,
      sameAs: [primary.linkedin, primary.github, primary.facebook, primary.twitter],
    };

    return (
      <>
        <JsonLd
          id={`executive-profile-${year}`}
          data={graph(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Executives", path: "/executives" },
              { name: primary.year, path: `/executives/${primary.year}` },
              { name: primary.name, path: `/executives/${year}` },
            ]),
            profilePageSchema(person)
          )}
        />
        {/* Show executive profile page */}
        <ExecutiveProfile executives={executives} />
      </>
    );
  }

  // Otherwise, treat it as a year
  const yearData = getExecutivesByYear(year);

  // If the requested year doesn't exist, show 404
  if (!yearData) {
    notFound();
  }

  const roster = getYearRoster(year);
  const people = [
    ...(roster?.facultyMembers ?? []),
    ...(roster?.studentExecutives ?? []),
  ];

  return (
    <div className="container py-4 md:py-8">
      <JsonLd
        id={`executives-${year}-schema`}
        data={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Executives", path: "/executives" },
            { name: year, path: `/executives/${year}` },
          ]),
          collectionPageSchema({
            name: `GUCC Executive Committee ${year}`,
            description: `Faculty advisors and student executives of the Green University Computer Club for ${year}.`,
            path: `/executives/${year}`,
            list: itemListSchema(
              `GUCC Executive Committee ${year}`,
              people.map((person) => ({
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
        )}
      />
      {/* Admin UI is client-side for interactivity */}
      <AdminPanel year={year} />
      {/* All executive and campus UI is client-side for interactivity */}
      <CampusTabs year={year} yearData={yearData} />
    </div>
  );
}
