import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { getPublicContests } from "@/lib/public/data";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, truncate } from "@/lib/seo/metadata";
import { breadcrumbSchema, graph, itemListSchema, webPageSchema } from "@/lib/seo/schema";
import { PageHero } from "@/components/page-hero";
import { ArrowLeft, Trophy } from "lucide-react";

interface Team {
  name: string;
  members: string[];
  rank: number;
  solved: number;
}

interface Contest {
  id: number;
  type: "IUPC" | "ICPC" | "NCPC";
  timestamp: string;
  title: string;
  teams: Team[];
  images: string[];
  contestLink: string;
  problemsetLink: string;
  standingsLink: string;
  editorialLink?: string;
  practiceLink?: string;
  event?: { slug: string; name: string };
}

async function findContest(id: string): Promise<Contest | undefined> {
  const all = (await getPublicContests()) as unknown as Contest[];
  return all.find((contest) => contest.id === parseInt(id));
}

export const revalidate = 21600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getPublicContests()).map((c) => ({ id: String(c.id) }));
}

/** "GubZeroFactorial (rank 95)" — the detail that makes a snippet useful. */
function describeTeams(contest: Contest): string {
  return contest.teams
    .filter((team) => team.name && team.name !== "N/A")
    .map((team) => (team.rank ? `${team.name} (rank ${team.rank})` : team.name))
    .join(", ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const contest = await findContest(id);

  if (!contest) {
    return buildMetadata({
      title: "Contest not found",
      description: "This GUCC contest record could not be found.",
      path: `/contests/${id}`,
      noIndex: true,
    });
  }

  const teams = describeTeams(contest);

  return buildMetadata({
    // Contest titles run long ("… at Rajshahi University of Engineering &
    // Technology (RUET)"); trimmed so the brand suffix still fits the SERP.
    title: `${truncate(contest.title, 46)} — ${contest.type}`,
    description: `Green University of Bangladesh at ${contest.title} (${contest.type}, ${contest.timestamp})${teams ? `. GUCC teams: ${teams}` : ""}. Team members, ranks and standings from the Green University Computer Club contest archive.`,
    path: `/contests/${id}`,
    keywords: [
      contest.title,
      contest.type,
      `${contest.type} Bangladesh`,
      "GUCC contests",
      "Green University programming team",
      "competitive programming Bangladesh",
    ],
    image: {
      eyebrow: `${contest.type} · ${contest.timestamp}`,
      title: contest.title.slice(0, 80),
      subtitle: teams.slice(0, 120),
    },
  });
}

export default async function ContestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contest = await findContest(id);

  if (!contest) {
    notFound();
  }

  return (
    <>
    <PageHero
      breadcrumb={
        <Link href="/contests" className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="h-4 w-4" aria-hidden />All contests
        </Link>
      }
      icon={<Trophy />}
      eyebrow={`${contest.type} · ${contest.timestamp}`}
      title={contest.title}
      size="sm"
    />
    <div className="container mx-auto py-12">
      <JsonLd
        id={`contest-${id}-schema`}
        data={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Contests", path: "/contests" },
            { name: contest.title, path: `/contests/${id}` },
          ]),
          webPageSchema({
            name: `${contest.title} — ${contest.type}`,
            description: `Green University Computer Club participation in ${contest.title} (${contest.type}, ${contest.timestamp}).`,
            path: `/contests/${id}`,
          }),
          itemListSchema(
            `GUCC teams at ${contest.title}`,
            contest.teams.map((team) => ({
              name: team.name,
              node: {
                "@type": "SportsTeam",
                name: team.name,
                member: team.members.map((member) => ({
                  "@type": "Person",
                  name: member.replace(/\.$/, ""),
                })),
              },
            }))
          )
        )}
      />
      <div className="space-y-8">

        {/* Team Performance */}
        <div className="grid gap-6 md:grid-cols-2">
          {contest.teams.map((team) => (
            <Card key={team.name} className="lift relative overflow-hidden rounded-3xl">
              <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
              <CardHeader className="relative flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="font-display text-xl">{team.name}</CardTitle>
                  <CardDescription className="mt-1 font-mono text-xs uppercase tracking-[0.15em]">Solved: {team.solved}</CardDescription>
                </div>
                <div className="text-right">
                  <p className="font-display text-4xl font-bold leading-none text-gradient">#{team.rank}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rank</p>
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="space-y-3 border-t border-border/60 pt-4">
                  <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Team members</h3>
                  <ul className="flex flex-wrap gap-2">
                    {team.members.map((member) => (
                      <li key={member} className="rounded-full border bg-background/60 px-3 py-1 text-sm">{member}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Contest Links */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="font-display text-xl">Contest resources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button asChild className="rounded-full">
                <Link href={contest.contestLink}>Contest Page</Link>
              </Button>
              <Button asChild className="rounded-full">
                <Link href={contest.problemsetLink}>Problem Set</Link>
              </Button>
              <Button asChild>
                <Link href={contest.standingsLink}>Standings</Link>
              </Button>
              {contest.editorialLink && (
                <Button variant="outline" asChild>
                  <Link href={contest.editorialLink}>Editorial</Link>
                </Button>
              )}
              {contest.practiceLink && (
                <Button variant="outline" asChild>
                  <Link href={contest.practiceLink}>Practice</Link>
                </Button>
              )}
              {contest.event && (
                <Button variant="outline" asChild>
                  <Link href={`/events/${contest.event.slug}`}>Event: {contest.event.name}</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contest Images */}
        {contest.images.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Photos</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {contest.images.map((image, index) => (
                <div
                  key={index}
                  className="relative aspect-video overflow-hidden rounded-lg border"
                >
                  <Image
                    src={image}
                    alt={`Contest photo ${index + 1}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
} 